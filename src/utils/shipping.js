const SHIPPING_METHODS = Object.freeze({
  HOME_DELIVERY: 'home_delivery',
  CONVENIENCE_STORE: 'convenience_store'
});

const SHIPPING_RATES = Object.freeze({
  HOME_DELIVERY: 120,
  CONVENIENCE_STORE: 60,
  FREE_SHIPPING_THRESHOLD: 1500,
  REMOTE_AREA_SURCHARGE: 200,
  EXPRESS_SURCHARGE: 250
});

const BASE_FEES = Object.freeze({
  [SHIPPING_METHODS.HOME_DELIVERY]: SHIPPING_RATES.HOME_DELIVERY,
  [SHIPPING_METHODS.CONVENIENCE_STORE]: SHIPPING_RATES.CONVENIENCE_STORE
});

/**
 * Calculate shipping fees from an order subtotal and delivery conditions.
 * Free shipping only waives the base fee; surcharges are always charged.
 */
function calculateShipping({ subtotal, method, isRemoteArea = false, isExpress = false }) {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new TypeError('subtotal 必須為非負有限數');
  }

  if (!Object.prototype.hasOwnProperty.call(BASE_FEES, method)) {
    throw new TypeError(`不支援的配送方式：${method}`);
  }

  if (typeof isRemoteArea !== 'boolean' || typeof isExpress !== 'boolean') {
    throw new TypeError('isRemoteArea 與 isExpress 必須為 boolean');
  }

  const originalBaseFee = BASE_FEES[method];
  const qualifiesForFreeShipping = subtotal >= SHIPPING_RATES.FREE_SHIPPING_THRESHOLD;
  const baseFee = qualifiesForFreeShipping ? 0 : originalBaseFee;
  const remoteAreaSurcharge = isRemoteArea ? SHIPPING_RATES.REMOTE_AREA_SURCHARGE : 0;
  const expressSurcharge = isExpress ? SHIPPING_RATES.EXPRESS_SURCHARGE : 0;
  const shippingFee = baseFee + remoteAreaSurcharge + expressSurcharge;

  return Object.freeze({
    method,
    subtotal,
    qualifiesForFreeShipping,
    originalBaseFee,
    baseFee,
    remoteAreaSurcharge,
    expressSurcharge,
    shippingFee,
    totalAmount: subtotal + shippingFee
  });
}

module.exports = {
  SHIPPING_METHODS,
  SHIPPING_RATES,
  calculateShipping
};
