// Issue A：結帳優惠碼（規格見第四場作業說明附錄）
const {
  app,
  request,
  createMember,
  createProduct,
  addToCart,
  placeOrder,
  getStock,
  getCartItems,
  expectError
} = require('./helpers');

// Builds a cart whose subtotal is exactly `subtotal`, then places an order
async function orderWithSubtotal(subtotal, couponCode) {
  const member = await createMember();
  const product = await createProduct({ price: subtotal, stock: 10 });
  await addToCart(member.token, product.id, 1);
  const extra = couponCode === undefined ? {} : { couponCode };
  const res = await placeOrder(member.token, extra);
  return { member, product, res };
}

function expectAmounts(res, { subtotal, discount, shippingFee }) {
  expect(res.status).toBe(201);
  expect(res.body.error).toBeNull();
  expect(res.body.data).toMatchObject({
    subtotal,
    discount,
    shipping_fee: shippingFee,
    total_amount: subtotal - discount + shippingFee
  });
}

describe('Issue A：結帳優惠碼', () => {
  it('未使用優惠碼時，折扣為 0，金額與原本相同', async () => {
    const { res } = await orderWithSubtotal(800);
    expectAmounts(res, { subtotal: 800, discount: 0, shippingFee: 120 });
  });

  it('FLOWER100：商品小計 800 元可使用，折抵 100 元', async () => {
    const { res } = await orderWithSubtotal(800, 'FLOWER100');
    expectAmounts(res, { subtotal: 800, discount: 100, shippingFee: 120 });
  });

  it('FLOWER100：商品小計 799 元未達門檻，回傳 400', async () => {
    const { res } = await orderWithSubtotal(799, 'FLOWER100');
    expectError(res, 400);
  });

  it('SPRING10：打 9 折、四捨五入至整數，最多折抵 300 元', async () => {
    const cases = [
      { subtotal: 1000, discount: 100, shippingFee: 120 },
      { subtotal: 1234, discount: 123, shippingFee: 120 },
      { subtotal: 3500, discount: 300, shippingFee: 0 }
    ];

    for (const expected of cases) {
      const { res } = await orderWithSubtotal(expected.subtotal, 'SPRING10');
      expectAmounts(res, expected);
    }
  });

  it('SUMMER50：已失效，回傳 400', async () => {
    const { res } = await orderWithSubtotal(1000, 'SUMMER50');
    expectError(res, 400);
  });

  it('免運門檻以折扣後的商品小計判斷：1,550 元折扣後 1,450 元，宅配需收 120 元', async () => {
    const { res } = await orderWithSubtotal(1550, 'FLOWER100');
    expectAmounts(res, { subtotal: 1550, discount: 100, shippingFee: 120 });
  });

  it('免運門檻以折扣後的商品小計判斷：1,600 元折扣後剛好 1,500 元，免基本運費', async () => {
    const { res } = await orderWithSubtotal(1600, 'FLOWER100');
    expectAmounts(res, { subtotal: 1600, discount: 100, shippingFee: 0 });
  });

  it('優惠碼不分大小寫：flower100 可正常使用', async () => {
    const { res } = await orderWithSubtotal(800, 'flower100');
    expectAmounts(res, { subtotal: 800, discount: 100, shippingFee: 120 });
  });

  it('訂單會記錄使用的優惠碼與折扣金額', async () => {
    const { member, res } = await orderWithSubtotal(800, 'FLOWER100');
    expect(res.status).toBe(201);

    const detail = await request(app)
      .get(`/api/orders/${res.body.data.id}`)
      .set('Authorization', `Bearer ${member.token}`);

    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      coupon_code: 'FLOWER100',
      discount: 100,
      total_amount: 820
    });
  });

  it('無效、已失效或未達門檻的優惠碼：不建立訂單、不扣庫存、不清空購物車', async () => {
    const cases = [
      { subtotal: 1000, couponCode: 'NOT-A-COUPON' },
      { subtotal: 1000, couponCode: 'SUMMER50' },
      { subtotal: 799, couponCode: 'FLOWER100' }
    ];

    for (const { subtotal, couponCode } of cases) {
      const { member, product, res } = await orderWithSubtotal(subtotal, couponCode);
      expectError(res, 400);

      const orders = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${member.token}`);
      expect(orders.body.data.orders).toHaveLength(0);

      expect(await getStock(product.id)).toBe(10);

      const cartItems = await getCartItems(member.token);
      expect(cartItems).toHaveLength(1);
      expect(cartItems[0]).toMatchObject({ product_id: product.id, quantity: 1 });
    }
  });
});
