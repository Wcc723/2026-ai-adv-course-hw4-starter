// Issue B：取消未付款訂單並回補庫存（規格見第四場作業說明附錄）
const {
  app,
  request,
  createMember,
  createProduct,
  addToCart,
  placeOrder,
  getStock,
  markPaid,
  expectError
} = require('./helpers');

// Order with two items: 2 × roses (stock 10 → 8) and 3 × lilies (stock 5 → 2)
async function createPendingOrder() {
  const member = await createMember();
  const roses = await createProduct({ price: 300, stock: 10 });
  const lilies = await createProduct({ price: 500, stock: 5 });
  await addToCart(member.token, roses.id, 2);
  await addToCart(member.token, lilies.id, 3);

  const res = await placeOrder(member.token);
  expect(res.status).toBe(201);
  expect(await getStock(roses.id)).toBe(8);
  expect(await getStock(lilies.id)).toBe(2);

  return { member, roses, lilies, order: res.body.data };
}

function cancel(orderId, token) {
  const req = request(app).post(`/api/orders/${orderId}/cancel`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

async function getOrderStatus(token, orderId) {
  const res = await request(app)
    .get(`/api/orders/${orderId}`)
    .set('Authorization', `Bearer ${token}`);
  return res.body.data.status;
}

describe('Issue B：取消未付款訂單並回補庫存', () => {
  it('取消 pending 訂單後，狀態為 cancelled，各品項庫存正確回補', async () => {
    const { member, roses, lilies, order } = await createPendingOrder();

    const res = await cancel(order.id, member.token);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({ id: order.id, status: 'cancelled' });
    expect(await getOrderStatus(member.token, order.id)).toBe('cancelled');
    expect(await getStock(roses.id)).toBe(10);
    expect(await getStock(lilies.id)).toBe(5);
  });

  it('取消 paid 訂單回傳 409，庫存不變', async () => {
    const { member, roses, lilies, order } = await createPendingOrder();
    await markPaid(member.token, order.id);

    const res = await cancel(order.id, member.token);

    expectError(res, 409);
    expect(await getOrderStatus(member.token, order.id)).toBe('paid');
    expect(await getStock(roses.id)).toBe(8);
    expect(await getStock(lilies.id)).toBe(2);
  });

  it('重複取消回傳 409，庫存不會重複回補', async () => {
    const { member, roses, lilies, order } = await createPendingOrder();

    const first = await cancel(order.id, member.token);
    expect(first.status).toBe(200);

    const second = await cancel(order.id, member.token);

    expectError(second, 409);
    expect(await getStock(roses.id)).toBe(10);
    expect(await getStock(lilies.id)).toBe(5);
  });

  it('以其他會員的 Token 取消回傳 404，訂單與庫存不變', async () => {
    const { member, roses, lilies, order } = await createPendingOrder();
    const stranger = await createMember();

    const res = await cancel(order.id, stranger.token);

    expectError(res, 404);
    expect(await getOrderStatus(member.token, order.id)).toBe('pending');
    expect(await getStock(roses.id)).toBe(8);
    expect(await getStock(lilies.id)).toBe(2);
  });

  it('未登入回傳 401', async () => {
    const { member, order } = await createPendingOrder();

    const res = await cancel(order.id);

    expectError(res, 401);
    expect(await getOrderStatus(member.token, order.id)).toBe('pending');
  });
});
