const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const { queryTradeInfo, verifyCheckMacValue, ECPAY_CONFIG } = require('../utils/ecpay');
const { SHIPPING_METHODS, calculateShipping } = require('../utils/shipping');

const router = express.Router();

router.use(authMiddleware);

function generateOrderNo() {
  // Use Taipei date so the order number matches ECPay MerchantTradeDate
  const dateStr = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    .replace(/-/g, '');
  const random = uuidv4().slice(0, 5).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Mock payment is test-only; otherwise any member could mark their own order as paid
function testEnvOnly(req, res, next) {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '找不到該資源' });
  }
  next();
}

function serializeOrder(order) {
  return {
    ...order,
    is_remote_area: Boolean(order.is_remote_area),
    is_express: Boolean(order.is_express)
  };
}

/**
 * @openapi
 * /api/orders:
 *   post:
 *     summary: 從購物車建立訂單
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientName, recipientEmail, recipientAddress, shippingMethod, isRemoteArea, isExpress]
 *             properties:
 *               recipientName:
 *                 type: string
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *               recipientAddress:
 *                 type: string
 *               shippingMethod:
 *                 type: string
 *                 enum: [home_delivery, convenience_store]
 *               isRemoteArea:
 *                 type: boolean
 *               isExpress:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: 訂單建立成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     order_no:
 *                       type: string
 *                     subtotal:
 *                       type: integer
 *                     shipping_fee:
 *                       type: integer
 *                     shipping_method:
 *                       type: string
 *                       enum: [home_delivery, convenience_store]
 *                     is_remote_area:
 *                       type: boolean
 *                     is_express:
 *                       type: boolean
 *                     total_amount:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           product_name:
 *                             type: string
 *                           product_price:
 *                             type: integer
 *                           quantity:
 *                             type: integer
 *                     created_at:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 購物車為空或庫存不足或收件資訊缺失
 */
router.post('/', (req, res) => {
  const {
    recipientName,
    recipientEmail,
    recipientAddress,
    shippingMethod,
    isRemoteArea,
    isExpress
  } = req.body;
  const userId = req.user.userId;

  if (!isNonEmptyString(recipientName) || !isNonEmptyString(recipientEmail) || !isNonEmptyString(recipientAddress)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: '收件人姓名、Email 和地址為必填欄位'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'Email 格式不正確'
    });
  }

  if (!Object.values(SHIPPING_METHODS).includes(shippingMethod)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'shippingMethod 必須為 home_delivery 或 convenience_store'
    });
  }

  if (typeof isRemoteArea !== 'boolean' || typeof isExpress !== 'boolean') {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'isRemoteArea 與 isExpress 必須為 boolean'
    });
  }

  // Get cart items with product info
  const cartItems = db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity,
            p.name as product_name, p.price as product_price, p.stock as product_stock
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?`
  ).all(userId);

  if (cartItems.length === 0) {
    return res.status(400).json({
      data: null,
      error: 'CART_EMPTY',
      message: '購物車為空'
    });
  }

  // Check stock
  const insufficientItems = cartItems.filter(item => item.quantity > item.product_stock);
  if (insufficientItems.length > 0) {
    const names = insufficientItems.map(i => i.product_name).join(', ');
    return res.status(400).json({
      data: null,
      error: 'STOCK_INSUFFICIENT',
      message: `以下商品庫存不足：${names}`
    });
  }

  // Calculate the subtotal and server-authoritative shipping fee.
  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.product_price * item.quantity, 0
  );
  const shipping = calculateShipping({
    subtotal,
    method: shippingMethod,
    isRemoteArea,
    isExpress
  });

  const orderId = uuidv4();
  const orderNo = generateOrderNo();
  const merchantTradeNo = orderNo.replace(/-/g, '');

  // Transaction: create order, order items, deduct stock, clear cart
  const createOrder = db.transaction(() => {
    db.prepare(
      `INSERT INTO orders (
         id, order_no, user_id, recipient_name, recipient_email, recipient_address,
         subtotal, shipping_fee, shipping_method, is_remote_area, is_express,
         total_amount, merchant_trade_no
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      orderId,
      orderNo,
      userId,
      recipientName,
      recipientEmail,
      recipientAddress,
      subtotal,
      shipping.shippingFee,
      shippingMethod,
      isRemoteArea ? 1 : 0,
      isExpress ? 1 : 0,
      shipping.totalAmount,
      merchantTradeNo
    );

    const insertItem = db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of cartItems) {
      insertItem.run(uuidv4(), orderId, item.product_id, item.product_name, item.product_price, item.quantity);
      updateStock.run(item.quantity, item.product_id);
    }

    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
  });

  createOrder();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare(
    'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?'
  ).all(orderId);

  res.status(201).json({
    data: {
      id: order.id,
      order_no: order.order_no,
      subtotal: order.subtotal,
      shipping_fee: order.shipping_fee,
      shipping_method: order.shipping_method,
      is_remote_area: Boolean(order.is_remote_area),
      is_express: Boolean(order.is_express),
      total_amount: order.total_amount,
      status: order.status,
      items: orderItems,
      created_at: order.created_at
    },
    error: null,
    message: '訂單建立成功'
  });
});

/**
 * @openapi
 * /api/orders:
 *   get:
 *     summary: 自己的訂單列表
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           order_no:
 *                             type: string
 *                           subtotal:
 *                             type: integer
 *                           shipping_fee:
 *                             type: integer
 *                           shipping_method:
 *                             type: string
 *                           total_amount:
 *                             type: integer
 *                           status:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 */
router.get('/', (req, res) => {
  const orders = db.prepare(
    `SELECT id, order_no, subtotal, shipping_fee, shipping_method,
            is_remote_area, is_express, total_amount, status, created_at
     FROM orders WHERE user_id = ? ORDER BY created_at DESC`
  ).all(req.user.userId);

  res.json({
    data: { orders: orders.map(serializeOrder) },
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     summary: 訂單詳情
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     order_no:
 *                       type: string
 *                     recipient_name:
 *                       type: string
 *                     recipient_email:
 *                       type: string
 *                     recipient_address:
 *                       type: string
 *                     subtotal:
 *                       type: integer
 *                     shipping_fee:
 *                       type: integer
 *                     shipping_method:
 *                       type: string
 *                       enum: [home_delivery, convenience_store]
 *                     is_remote_area:
 *                       type: boolean
 *                     is_express:
 *                       type: boolean
 *                     total_amount:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           product_id:
 *                             type: string
 *                           product_name:
 *                             type: string
 *                           product_price:
 *                             type: integer
 *                           quantity:
 *                             type: integer
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       404:
 *         description: 訂單不存在
 */
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

  res.json({
    data: { ...serializeOrder(order), items },
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/orders/{id}/pay:
 *   patch:
 *     summary: 模擬付款（僅 NODE_ENV=test 開放，其他環境回 404）
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [success, fail]
 *     responses:
 *       200:
 *         description: 付款狀態更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     order_no:
 *                       type: string
 *                     total_amount:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           product_name:
 *                             type: string
 *                           product_price:
 *                             type: integer
 *                           quantity:
 *                             type: integer
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: action 無效或訂單狀態不是 pending
 *       404:
 *         description: 訂單不存在，或非測試環境
 */
router.patch('/:id/pay', testEnvOnly, (req, res) => {
  const { action } = req.body;
  const userId = req.user.userId;

  const actionMap = { success: 'paid', fail: 'failed' };
  if (!action || !actionMap[action]) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'action 必須為 success 或 fail'
    });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  if (order.status !== 'pending') {
    return res.status(400).json({
      data: null,
      error: 'INVALID_STATUS',
      message: '訂單狀態不是 pending，無法付款'
    });
  }

  const newStatus = actionMap[action];
  db.prepare("UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'").run(newStatus, order.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

  res.json({
    data: { ...serializeOrder(updated), items },
    error: null,
    message: action === 'success' ? '付款成功' : '付款失敗'
  });
});

/**
 * @openapi
 * /api/orders/{id}/check-payment:
 *   post:
 *     summary: 透過綠界 QueryTradeInfo API 查詢付款狀態
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 查詢成功（已付款、尚未付款，或訂單已非 pending 時回傳目前狀態）
 *       400:
 *         description: 此訂單無綠界交易編號（NO_TRADE_NO）
 *       404:
 *         description: 訂單不存在
 *       500:
 *         description: 綠界查詢失敗，或回應的 CheckMacValue、交易編號、金額驗證不符（ECPAY_QUERY_ERROR）
 */
router.post('/:id/check-payment', async (req, res) => {
  const userId = req.user.userId;

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  if (order.status !== 'pending') {
    const items = db.prepare('SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?').all(order.id);
    return res.json({
      data: { ...serializeOrder(order), items },
      error: null,
      message: order.status === 'paid' ? '此訂單已付款' : '此訂單付款失敗'
    });
  }

  if (!order.merchant_trade_no) {
    return res.status(400).json({ data: null, error: 'NO_TRADE_NO', message: '此訂單無綠界交易編號' });
  }

  try {
    const result = await queryTradeInfo(order.merchant_trade_no);

    if (result.TradeStatus === '1') {
      // Verify the response is authentic and matches this order before marking it paid
      const verified = verifyCheckMacValue(result, ECPAY_CONFIG.hashKey, ECPAY_CONFIG.hashIV)
        && result.MerchantTradeNo === order.merchant_trade_no
        && Number(result.TradeAmt) === order.total_amount;
      if (!verified) {
        throw new Error('QueryTradeInfo response verification failed');
      }

      db.prepare("UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'pending'").run(order.id);
      const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      const items = db.prepare('SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?').all(order.id);
      return res.json({
        data: { ...serializeOrder(updated), items },
        error: null,
        message: '付款成功'
      });
    }

    const items = db.prepare('SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?').all(order.id);
    return res.json({
      data: { ...serializeOrder(order), items, ecpay_trade_status: result.TradeStatus },
      error: null,
      message: '尚未完成付款，請稍後再查詢'
    });
  } catch (err) {
    console.error('[ECPay] QueryTradeInfo error:', err.message);
    return res.status(500).json({
      data: null,
      error: 'ECPAY_QUERY_ERROR',
      message: '查詢綠界付款狀態失敗，請稍後再試'
    });
  }
});

module.exports = router;
