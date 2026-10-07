const db = require('../database');
const { verifyCheckMacValue, ECPAY_CONFIG } = require('../utils/ecpay');

const TRADE_STATUS_PAID = '1';

/**
 * Decide whether an ECPay QueryTradeInfo result means the order has been paid.
 * Throws when a paid result does not belong to this order.
 */
function isTradePaid(order, tradeInfo, config = ECPAY_CONFIG) {
  if (tradeInfo.TradeStatus !== TRADE_STATUS_PAID) {
    return false;
  }

  if (tradeInfo.CheckMacValue && !verifyCheckMacValue(tradeInfo, config.hashKey, config.hashIV)) {
    throw new Error('QueryTradeInfo CheckMacValue mismatch');
  }

  if (tradeInfo.MerchantTradeNo !== order.merchant_trade_no) {
    throw new Error('QueryTradeInfo MerchantTradeNo mismatch');
  }

  if (Number(tradeInfo.TradeAmt) !== order.total_amount) {
    throw new Error('QueryTradeInfo TradeAmt mismatch');
  }

  return true;
}

// Only pending orders can become paid, so the status never goes backwards
function markOrderPaid(orderId) {
  const result = db.prepare(
    "UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'pending'"
  ).run(orderId);
  return result.changes > 0;
}

module.exports = {
  TRADE_STATUS_PAID,
  isTradePaid,
  markOrderPaid
};
