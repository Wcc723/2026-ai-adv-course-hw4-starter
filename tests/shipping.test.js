const {
  SHIPPING_METHODS,
  calculateShipping
} = require('../src/utils/shipping');

describe('Shipping module', () => {
  it('計算宅配基本運費 120 元', () => {
    const result = calculateShipping({
      subtotal: 1000,
      method: SHIPPING_METHODS.HOME_DELIVERY
    });

    expect(result.shippingFee).toBe(120);
    expect(result.totalAmount).toBe(1120);
  });

  it('計算超商取貨費用 60 元', () => {
    const result = calculateShipping({
      subtotal: 1000,
      method: SHIPPING_METHODS.CONVENIENCE_STORE
    });

    expect(result.shippingFee).toBe(60);
  });

  it('商品小計 1,499 元時仍收基本運費', () => {
    const result = calculateShipping({
      subtotal: 1499,
      method: SHIPPING_METHODS.HOME_DELIVERY
    });

    expect(result.qualifiesForFreeShipping).toBe(false);
    expect(result.shippingFee).toBe(120);
  });

  it('商品小計 1,500 元時免基本運費', () => {
    const result = calculateShipping({
      subtotal: 1500,
      method: SHIPPING_METHODS.HOME_DELIVERY
    });

    expect(result.qualifiesForFreeShipping).toBe(true);
    expect(result.shippingFee).toBe(0);
  });

  it('加收偏遠地區附加費 200 元', () => {
    const result = calculateShipping({
      subtotal: 1000,
      method: SHIPPING_METHODS.HOME_DELIVERY,
      isRemoteArea: true
    });

    expect(result.remoteAreaSurcharge).toBe(200);
    expect(result.shippingFee).toBe(320);
  });

  it('加收當日急件附加費 250 元', () => {
    const result = calculateShipping({
      subtotal: 1000,
      method: SHIPPING_METHODS.HOME_DELIVERY,
      isExpress: true
    });

    expect(result.expressSurcharge).toBe(250);
    expect(result.shippingFee).toBe(370);
  });

  it('同時加收偏遠地區與當日急件附加費', () => {
    const result = calculateShipping({
      subtotal: 1000,
      method: SHIPPING_METHODS.HOME_DELIVERY,
      isRemoteArea: true,
      isExpress: true
    });

    expect(result.shippingFee).toBe(570);
  });

  it('滿額免基本運費時仍收所有附加費', () => {
    const result = calculateShipping({
      subtotal: 1500,
      method: SHIPPING_METHODS.HOME_DELIVERY,
      isRemoteArea: true,
      isExpress: true
    });

    expect(result.baseFee).toBe(0);
    expect(result.shippingFee).toBe(450);
    expect(result.totalAmount).toBe(1950);
  });

  it('拒絕無效的商品小計、配送方式與條件旗標', () => {
    expect(() => calculateShipping({
      subtotal: -1,
      method: SHIPPING_METHODS.HOME_DELIVERY
    })).toThrow(TypeError);

    expect(() => calculateShipping({
      subtotal: 1000,
      method: 'drone'
    })).toThrow(TypeError);

    expect(() => calculateShipping({
      subtotal: 1000,
      method: SHIPPING_METHODS.HOME_DELIVERY,
      isRemoteArea: 1
    })).toThrow(TypeError);
  });
});
