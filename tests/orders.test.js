const { app, request, registerUser } = require('./setup');

describe('Orders API', () => {
  let userToken;
  let productId;
  let productPrice;
  let orderId;

  beforeAll(async () => {
    // Register a user for order tests
    const { token } = await registerUser();
    userToken = token;

    // Get a product id
    const prodRes = await request(app).get('/api/products');
    productId = prodRes.body.data.products[0].id;
    productPrice = prodRes.body.data.products[0].price;

    // Add product to cart
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 1 });
  });

  it('should create an order from cart', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'convenience_store',
        isRemoteArea: true,
        isExpress: true,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('subtotal', productPrice);
    expect(res.body.data).toHaveProperty(
      'shipping_fee',
      (productPrice >= 1500 ? 0 : 60) + 200 + 250
    );
    expect(res.body.data).toHaveProperty('shipping_method', 'convenience_store');
    expect(res.body.data).toHaveProperty('is_remote_area', true);
    expect(res.body.data).toHaveProperty('is_express', true);
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data.total_amount).toBe(
      res.body.data.subtotal + res.body.data.shipping_fee
    );
    expect(res.body.data).toHaveProperty('status', 'pending');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);

    orderId = res.body.data.id;
  });

  it('should fail to create order with empty cart', async () => {
    // The cart was already cleared by the previous order
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery',
        isRemoteArea: false,
        isExpress: false,
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });

  it('should fail to create order without auth', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should get order list', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('orders');
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });

  it('should get order detail', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id', orderId);
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('subtotal', productPrice);
    expect(res.body.data).toHaveProperty('shipping_fee');
    expect(res.body.data).toHaveProperty('shipping_method', 'convenience_store');
    expect(res.body.data).toHaveProperty('is_remote_area', true);
    expect(res.body.data).toHaveProperty('is_express', true);
    expect(res.body.data.total_amount).toBe(
      res.body.data.subtotal + res.body.data.shipping_fee
    );
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('should return 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/orders/non-existent-order-id')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });

  it('should reject non-string recipient fields', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: { first: '測試' },
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery',
        isRemoteArea: false,
        isExpress: false,
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should hide mock payment outside the test environment', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const res = await request(app)
        .patch(`/api/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ action: 'success' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('data', null);
      expect(res.body).toHaveProperty('error', 'NOT_FOUND');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should mock payment once in the test environment', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'success' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('status', 'paid');

    const again = await request(app)
      .patch(`/api/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'fail' });

    expect(again.status).toBe(400);
    expect(again.body).toHaveProperty('error', 'INVALID_STATUS');
  });
});
