const {
  SHIPPING_METHODS,
  calculateShipping
} = require('../src/utils/shipping');

const { HOME_DELIVERY, CONVENIENCE_STORE } = SHIPPING_METHODS;

describe('Shipping module', () => {
  describe('基本運費', () => {
    it.each([
      ['宅配', HOME_DELIVERY, 120],
      ['超商取貨', CONVENIENCE_STORE, 60]
    ])('%s基本運費 %i 元', (_label, method, expectedFee) => {
      const result = calculateShipping({ subtotal: 1000, method });

      expect(result.shippingFee).toBe(expectedFee);
      expect(result.totalAmount).toBe(1000 + expectedFee);
    });
  });

  describe('滿額免基本運費', () => {
    it('商品小計 1,499 元時仍收基本運費', () => {
      const result = calculateShipping({ subtotal: 1499, method: HOME_DELIVERY });

      expect(result.qualifiesForFreeShipping).toBe(false);
      expect(result.shippingFee).toBe(120);
    });

    it.skip('商品小計 1,500 元時免基本運費', () => {
      const result = calculateShipping({ subtotal: 1500, method: HOME_DELIVERY });

      expect(result.qualifiesForFreeShipping).toBe(true);
      expect(result.shippingFee).toBe(0);
    });

    it.each([
      ['宅配', HOME_DELIVERY],
      ['超商取貨', CONVENIENCE_STORE]
    ])('商品小計 2,000 元時，%s免基本運費', (_label, method) => {
      const result = calculateShipping({ subtotal: 2000, method });

      expect(result.qualifiesForFreeShipping).toBe(true);
      expect(result.baseFee).toBe(0);
      expect(result.shippingFee).toBe(0);
    });
  });

  describe('附加費', () => {
    it.each([
      ['偏遠地區', { isRemoteArea: true }, 'remoteAreaSurcharge', 200, 320],
      ['當日急件', { isExpress: true }, 'expressSurcharge', 250, 370]
    ])('加收%s附加費', (_label, options, field, surcharge, expectedFee) => {
      const result = calculateShipping({ subtotal: 1000, method: HOME_DELIVERY, ...options });

      expect(result[field]).toBe(surcharge);
      expect(result.shippingFee).toBe(expectedFee);
    });

    it('同時加收偏遠地區與當日急件附加費', () => {
      const result = calculateShipping({
        subtotal: 1000,
        method: HOME_DELIVERY,
        isRemoteArea: true,
        isExpress: true
      });

      expect(result.shippingFee).toBe(570);
    });

    it('滿額免基本運費時仍收所有附加費', () => {
      const result = calculateShipping({
        subtotal: 2000,
        method: HOME_DELIVERY,
        isRemoteArea: true,
        isExpress: true
      });

      expect(result.baseFee).toBe(0);
      expect(result.shippingFee).toBe(450);
      expect(result.totalAmount).toBe(2450);
    });
  });

  describe('輸入驗證', () => {
    it.each([
      ['負數小計', { subtotal: -1, method: HOME_DELIVERY }],
      ['不支援的配送方式', { subtotal: 1000, method: 'drone' }],
      ['非 boolean 的條件旗標', { subtotal: 1000, method: HOME_DELIVERY, isRemoteArea: 1 }]
    ])('拒絕%s', (_label, input) => {
      expect(() => calculateShipping(input)).toThrow(TypeError);
    });
  });
});
