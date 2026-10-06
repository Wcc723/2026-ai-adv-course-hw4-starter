// Issue C：我的訂單篩選與分頁（規格見第四場作業說明附錄）
const {
  app,
  request,
  createMember,
  createProduct,
  addToCart,
  placeOrder,
  markPaid,
  expectError
} = require('./helpers');

async function createOrders(member, count) {
  const product = await createProduct({ price: 100, stock: 100 });
  const orders = [];
  for (let i = 0; i < count; i++) {
    await addToCart(member.token, product.id, 1);
    const res = await placeOrder(member.token);
    expect(res.status).toBe(201);
    orders.push(res.body.data);
  }
  return orders;
}

function listOrders(token, query = '') {
  return request(app)
    .get(`/api/orders${query}`)
    .set('Authorization', `Bearer ${token}`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('Issue C：我的訂單篩選與分頁', () => {
  it('不帶參數時回傳第 1 頁、每頁 10 筆，依建立時間由新到舊', async () => {
    const member = await createMember();
    await createOrders(member, 12);

    const res = await listOrders(member.token);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.orders).toHaveLength(10);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 10, total: 12, totalPages: 2 });

    const createdAt = res.body.data.orders.map(order => order.created_at);
    expect([...createdAt].sort().reverse()).toEqual(createdAt);
  });

  it('不同時間建立的訂單，較新的排在前面', async () => {
    const member = await createMember();
    const [older] = await createOrders(member, 1);
    // created_at has one-second precision, so wait to get distinct timestamps
    await sleep(1100);
    const [newer] = await createOrders(member, 1);

    const res = await listOrders(member.token);

    expect(res.status).toBe(200);
    expect(res.body.data.orders.map(order => order.id)).toEqual([newer.id, older.id]);
  });

  it('status=paid 只回傳已付款訂單', async () => {
    const member = await createMember();
    const orders = await createOrders(member, 3);
    await markPaid(member.token, orders[1].id);

    const paid = await listOrders(member.token, '?status=paid');
    expect(paid.status).toBe(200);
    expect(paid.body.data.orders.map(order => order.id)).toEqual([orders[1].id]);
    expect(paid.body.data.pagination.total).toBe(1);

    const pending = await listOrders(member.token, '?status=pending');
    expect(pending.status).toBe(200);
    expect(pending.body.data.orders).toHaveLength(2);
    expect(pending.body.data.orders.every(order => order.status === 'pending')).toBe(true);
  });

  it('12 筆訂單、limit=5 時，第 3 頁有 2 筆，totalPages 為 3', async () => {
    const member = await createMember();
    await createOrders(member, 12);

    const res = await listOrders(member.token, '?page=3&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(2);
    expect(res.body.data.pagination).toEqual({ page: 3, limit: 5, total: 12, totalPages: 3 });
  });

  it('limit 超過 50 時以 50 計', async () => {
    const member = await createMember();
    await createOrders(member, 1);

    const res = await listOrders(member.token, '?limit=100');

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBe(50);
  });

  it('status 不在允許值內，或 page、limit 不是正整數時，回傳 400', async () => {
    const member = await createMember();

    for (const query of ['?status=unknown', '?page=0', '?limit=-1']) {
      const res = await listOrders(member.token, query);
      expectError(res, 400);
    }
  });

  it('不會回傳其他會員的訂單', async () => {
    const member = await createMember();
    const others = await createMember();
    const mine = await createOrders(member, 2);
    await createOrders(others, 3);

    const res = await listOrders(member.token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
    expect(res.body.data.orders.map(order => order.id).sort()).toEqual(mine.map(order => order.id).sort());
  });
});
