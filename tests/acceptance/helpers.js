// Shared helpers for acceptance tests.
// Acceptance tests talk to the app through HTTP only, so they do not depend on
// internal function names or table structures. Every test creates its own
// member and products, so tests never share data.
const request = require('supertest');
const app = require('../setup/testServer');

const ADMIN = { email: 'admin@hexschool.com', password: '12345678' };

const HOME_DELIVERY = {
  recipientName: '驗收測試收件人',
  recipientEmail: 'acceptance@example.com',
  recipientAddress: '台北市驗收路 1 號',
  shippingMethod: 'home_delivery',
  isRemoteArea: false,
  isExpress: false
};

let sequence = 0;
function uniqueSuffix() {
  sequence += 1;
  return `${Date.now()}-${sequence}`;
}

async function getAdminToken() {
  const res = await request(app).post('/api/auth/login').send(ADMIN);
  return res.body.data.token;
}

async function createMember() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email: `acceptance-${uniqueSuffix()}@example.com`,
      password: 'password123',
      name: '驗收測試會員'
    });
  return { token: res.body.data.token, user: res.body.data.user };
}

async function createProduct({ price, stock = 50 }) {
  const adminToken = await getAdminToken();
  const res = await request(app)
    .post('/api/admin/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `驗收測試商品 ${uniqueSuffix()}`, price, stock });
  return res.body.data;
}

async function addToCart(token, productId, quantity) {
  const res = await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity });
  expect(res.status).toBe(200);
  return res.body.data;
}

function placeOrder(token, extra = {}) {
  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...HOME_DELIVERY, ...extra });
}

async function getStock(productId) {
  const res = await request(app).get(`/api/products/${productId}`);
  return res.body.data.stock;
}

async function getCartItems(token) {
  const res = await request(app)
    .get('/api/cart')
    .set('Authorization', `Bearer ${token}`);
  return res.body.data.items;
}

// Marks an order as paid through the test-only mock payment endpoint
async function markPaid(token, orderId) {
  const res = await request(app)
    .patch(`/api/orders/${orderId}/pay`)
    .set('Authorization', `Bearer ${token}`)
    .send({ action: 'success' });
  expect(res.status).toBe(200);
}

function expectError(res, status) {
  expect(res.status).toBe(status);
  expect(res.body).toHaveProperty('data', null);
  expect(typeof res.body.error).toBe('string');
  expect(res.body.error.length).toBeGreaterThan(0);
  expect(typeof res.body.message).toBe('string');
}

module.exports = {
  app,
  request,
  createMember,
  createProduct,
  addToCart,
  placeOrder,
  getStock,
  getCartItems,
  markPaid,
  expectError
};
