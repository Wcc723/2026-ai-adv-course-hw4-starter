const { v4: uuidv4 } = require('uuid');
const db = require('../database');

function generateOrderNo() {
  // Use Taipei date so the order number matches ECPay MerchantTradeDate
  const dateStr = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    .replace(/-/g, '');
  const random = uuidv4().slice(0, 5).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

function serializeOrder(order) {
  return {
    ...order,
    is_remote_area: Boolean(order.is_remote_area),
    is_express: Boolean(order.is_express)
  };
}

function findOrderById(orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

function findOrderForUser(orderId, userId) {
  return db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
}

function listOrdersForUser(userId) {
  return db.prepare(
    `SELECT id, order_no, subtotal, shipping_fee, shipping_method,
            is_remote_area, is_express, total_amount, status, created_at
     FROM orders WHERE user_id = ? ORDER BY created_at DESC`
  ).all(userId);
}

function getOrderItems(orderId) {
  return db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
}

function getOrderItemSummaries(orderId) {
  return db.prepare(
    'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?'
  ).all(orderId);
}

// Cart items joined with the current product price and stock
function getCheckoutItems(userId) {
  return db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity,
            p.name as product_name, p.price as product_price, p.stock as product_stock
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?`
  ).all(userId);
}

function findInsufficientItems(cartItems) {
  return cartItems.filter(item => item.quantity > item.product_stock);
}

/**
 * Create an order from the member's cart in one transaction:
 * insert order → snapshot items → deduct stock → clear cart.
 * Amounts must already be calculated by the caller.
 */
function createOrderFromCart({ userId, recipient, delivery, cartItems, subtotal, shipping }) {
  const orderId = uuidv4();
  const orderNo = generateOrderNo();
  const merchantTradeNo = orderNo.replace(/-/g, '');

  const insertOrder = db.prepare(
    `INSERT INTO orders (
       id, order_no, user_id, recipient_name, recipient_email, recipient_address,
       subtotal, shipping_fee, shipping_method, is_remote_area, is_express,
       total_amount, merchant_trade_no
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertItem = db.prepare(
    `INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
  const clearCart = db.prepare('DELETE FROM cart_items WHERE user_id = ?');

  db.transaction(() => {
    insertOrder.run(
      orderId,
      orderNo,
      userId,
      recipient.name,
      recipient.email,
      recipient.address,
      subtotal,
      shipping.shippingFee,
      delivery.method,
      delivery.isRemoteArea ? 1 : 0,
      delivery.isExpress ? 1 : 0,
      shipping.totalAmount,
      merchantTradeNo
    );

    for (const item of cartItems) {
      insertItem.run(uuidv4(), orderId, item.product_id, item.product_name, item.product_price, item.quantity);
      updateStock.run(item.quantity, item.product_id);
    }

    clearCart.run(userId);
  })();

  return orderId;
}

module.exports = {
  generateOrderNo,
  serializeOrder,
  findOrderById,
  findOrderForUser,
  listOrdersForUser,
  getOrderItems,
  getOrderItemSummaries,
  getCheckoutItems,
  findInsufficientItems,
  createOrderFromCart
};
