const { app, request, getAdminToken, registerUser } = require('./setup');

describe('Cart API', () => {
  const sessionId = 'test-session-' + Date.now();
  let productId;
  let cartItemId;
  let userToken;

  beforeAll(async () => {
    // Get a product id from the product list
    const res = await request(app).get('/api/products');
    productId = res.body.data.products[0].id;
  });

  it('should add product to cart (guest mode)', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('product_id', productId);
    expect(res.body.data).toHaveProperty('quantity');

    cartItemId = res.body.data.id;
  });

  it('should get cart (guest mode)', async () => {
    const res = await request(app)
      .get('/api/cart')
      .set('X-Session-Id', sessionId);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('total');
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('should update cart item quantity (guest mode)', async () => {
    const res = await request(app)
      .patch(`/api/cart/${cartItemId}`)
      .set('X-Session-Id', sessionId)
      .send({ quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('quantity', 3);
  });

  it('should remove cart item (guest mode)', async () => {
    const res = await request(app)
      .delete(`/api/cart/${cartItemId}`)
      .set('X-Session-Id', sessionId);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);

    // Verify cart is empty
    const cartRes = await request(app)
      .get('/api/cart')
      .set('X-Session-Id', sessionId);
    expect(cartRes.body.data.items.length).toBe(0);
  });

  it('should add product to cart (authenticated mode)', async () => {
    const { token } = await registerUser();
    userToken = token;

    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('product_id', productId);
  });

  it('should fail to add non-existent product to cart', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId: 'non-existent-product-id', quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should reject non-integer quantity', async () => {
    for (const quantity of [1.9, '3abc', [5]]) {
      const res = await request(app)
        .post('/api/cart')
        .set('X-Session-Id', sessionId)
        .send({ productId, quantity });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('data', null);
      expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
    }
  });

  it('should merge the guest cart into the member cart on login', async () => {
    const guestSessionId = 'merge-login-' + Date.now();
    const email = `merge-${Date.now()}@example.com`;
    const { token } = await registerUser({ email });

    // Member already has 1; as a guest they add 2 more of the same product
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 1 });
    await request(app)
      .post('/api/cart')
      .set('X-Session-Id', guestSessionId)
      .send({ productId, quantity: 2 });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Session-Id', guestSessionId)
      .send({ email, password: 'password123' });
    expect(loginRes.status).toBe(200);

    const memberCart = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);
    const merged = memberCart.body.data.items.filter(item => item.product_id === productId);
    expect(merged.length).toBe(1);
    expect(merged[0]).toHaveProperty('quantity', 3);

    const guestCart = await request(app)
      .get('/api/cart')
      .set('X-Session-Id', guestSessionId);
    expect(guestCart.body.data.items.length).toBe(0);
  });

  it('should merge the guest cart on register and cap quantity at stock', async () => {
    const adminToken = await getAdminToken();
    const productRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '合併測試花束', price: 500, stock: 3 });
    const limitedProductId = productRes.body.data.id;

    const guestSessionId = 'merge-register-' + Date.now();
    await request(app)
      .post('/api/cart')
      .set('X-Session-Id', guestSessionId)
      .send({ productId: limitedProductId, quantity: 3 });

    // Stock drops after the guest added the item
    await request(app)
      .put(`/api/admin/products/${limitedProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 2 });

    const registerRes = await request(app)
      .post('/api/auth/register')
      .set('X-Session-Id', guestSessionId)
      .send({ email: `merge-register-${Date.now()}@example.com`, password: 'password123', name: '合併測試' });
    expect(registerRes.status).toBe(201);

    const memberCart = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${registerRes.body.data.token}`);
    expect(memberCart.body.data.items.length).toBe(1);
    expect(memberCart.body.data.items[0]).toHaveProperty('product_id', limitedProductId);
    expect(memberCart.body.data.items[0]).toHaveProperty('quantity', 2);
  });
});
