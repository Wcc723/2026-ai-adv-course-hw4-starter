const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

const SALT_ROUNDS = process.env.NODE_ENV === 'test' ? 1 : 10;

// Move the guest cart (X-Session-Id) into the member cart after login/register.
// Quantities of the same product are summed and capped at the current stock.
function mergeGuestCart(sessionId, userId) {
  if (!sessionId) return;

  const guestItems = db.prepare(
    `SELECT ci.product_id, ci.quantity, p.stock
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.session_id = ?`
  ).all(sessionId);
  if (guestItems.length === 0) return;

  const findMemberItem = db.prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?');
  const updateQuantity = db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?');
  const insertItem = db.prepare('INSERT INTO cart_items (id, user_id, product_id, quantity) VALUES (?, ?, ?, ?)');

  db.transaction(() => {
    for (const item of guestItems) {
      const memberItem = findMemberItem.get(userId, item.product_id);
      const quantity = Math.min((memberItem ? memberItem.quantity : 0) + item.quantity, item.stock);
      if (memberItem) {
        if (quantity > memberItem.quantity) updateQuantity.run(quantity, memberItem.id);
      } else if (quantity > 0) {
        insertItem.run(uuidv4(), userId, item.product_id, quantity);
      }
    }
    db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(sessionId);
  })();
}

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: 註冊新帳號
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: 註冊成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                         role:
 *                           type: string
 *                     token:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 參數缺失或格式錯誤
 *       409:
 *         description: Email 已被註冊
 */
router.post('/register', (req, res) => {
  const { email, password, name } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string'
    || !email || !password || !name.trim()) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'email、password、name 為必填欄位'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'Email 格式不正確'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: '密碼至少需要 6 個字元'
    });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({
      data: null,
      error: 'CONFLICT',
      message: 'Email 已被註冊'
    });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);

  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email, passwordHash, name, 'user');

  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id);
  mergeGuestCart(req.sessionId, user.id);

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    data: {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token
    },
    error: null,
    message: '註冊成功'
  });
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: 登入
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 登入成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                         role:
 *                           type: string
 *                     token:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 參數缺失
 *       401:
 *         description: Email 或密碼錯誤
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'email 和 password 為必填欄位'
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({
      data: null,
      error: 'UNAUTHORIZED',
      message: 'Email 或密碼錯誤'
    });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({
      data: null,
      error: 'UNAUTHORIZED',
      message: 'Email 或密碼錯誤'
    });
  }

  mergeGuestCart(req.sessionId, user.id);

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    data: {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token
    },
    error: null,
    message: '登入成功'
  });
});

/**
 * @openapi
 * /api/auth/profile:
 *   get:
 *     summary: 取得個人資料
 *     tags: [Auth]
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
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       401:
 *         description: 未登入或 token 無效
 */
router.get('/profile', authMiddleware, (req, res) => {
  // authMiddleware already returns 401 when the user no longer exists
  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.user.userId);

  res.json({
    data: user,
    error: null,
    message: '成功'
  });
});

module.exports = router;
