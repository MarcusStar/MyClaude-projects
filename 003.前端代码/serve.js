/**
 * 本地静态服务器（零依赖）
 * ------------------------------------------------------------------
 * ES Module 在 file:// 协议下会被浏览器 CORS 策略拦截，
 * 因此需要通过 HTTP 访问本项目。
 *
 *   node serve.js            # 默认 http://localhost:5173
 *   node serve.js 8080       # 指定端口
 *
 * 访问根路径会跳转到流水首页 pages/home.html；
 * 页面索引 index.html 仍可通过 /index.html 访问。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 5173;

/** 根路径的默认落地页 */
const DEFAULT_ROUTE = '/pages/home.html';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  // 根路径 → 默认落地页
  if (url === '/') {
    res.writeHead(302, { Location: DEFAULT_ROUTE }).end();
    return;
  }

  let filePath = path.join(ROOT, url);

  // 阻止路径穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  // 目录 → index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`随手记账 · 本地服务已启动`);
  console.log(`  → http://localhost:${PORT}/  （自动进入流水首页）`);
  console.log(`  → http://localhost:${PORT}/index.html  （页面索引）`);
});
