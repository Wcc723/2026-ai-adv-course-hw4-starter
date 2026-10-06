const { v4: uuidv4 } = require('uuid');
const db = require('../../src/database');

const clearDatabase = db.transaction(() => {
  db.prepare('DELETE FROM order_items').run();
  db.prepare('DELETE FROM orders').run();
  db.prepare('DELETE FROM cart_items').run();
  db.prepare('DELETE FROM products').run();
  db.prepare('DELETE FROM users').run();
});

function resetDatabase() {
  db.exec('DROP TRIGGER IF EXISTS integration_fail_second_order_item');
  clearDatabase();
}

function createProduct(overrides = {}) {
  const product = {
    id: overrides.id || uuidv4(),
    name: overrides.name || '整合測試花束',
    description: overrides.description || '僅供 Integration Test 使用',
    price: overrides.price ?? 700,
    stock: overrides.stock ?? 10,
    imageUrl: overrides.imageUrl || 'https://example.com/integration-flower.jpg'
  };

  db.prepare(
    `INSERT INTO products (id, name, description, price, stock, image_url)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    product.id,
    product.name,
    product.description,
    product.price,
    product.stock,
    product.imageUrl
  );

  return product;
}

function getMainDatabaseInfo() {
  return db.prepare('PRAGMA database_list').all().find(database => database.name === 'main');
}

module.exports = {
  db,
  resetDatabase,
  createProduct,
  getMainDatabaseInfo
};
