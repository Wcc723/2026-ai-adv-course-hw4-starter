// 給 supertest 使用的測試伺服器。
// 直接寫 request(app) 時，supertest 會用 listen(0) 綁在 ::，卻固定連到 127.0.0.1。
// 在 macOS 上可能分到「其他程式只綁在 127.0.0.1」的同一個埠，請求就送到那個程式，
// 測試會隨機出現 401、200 或逾時。因此先在 127.0.0.1 開好伺服器，再交給 supertest。
const http = require('http');
const app = require('../../app');

module.exports = http.createServer(app).listen(0, '127.0.0.1').unref();
