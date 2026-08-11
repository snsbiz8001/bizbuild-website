/*
 * 촬영용 임시 정적 서버.
 *
 * 파일을 브라우저로 직접 열면(file://) 절대경로(/favicon.ico, /assets/track.js)가
 * 깨지므로, 실제 사이트와 같은 조건을 만들기 위해 잠깐 서버를 띄운다.
 * 포트는 OS가 비어 있는 것을 골라주므로 충돌하지 않는다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
};

/** 사이트 루트를 서빙하는 서버를 띄우고 { port, close } 를 돌려준다. */
function start(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';

      let file = path.join(root, rel);
      /* Netlify 와 동일하게 확장자 없는 주소도 .html 로 찾아준다 */
      if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';

      /* 루트 밖으로 나가는 경로는 거부 */
      if (!path.resolve(file).startsWith(path.resolve(root))) {
        res.writeHead(403).end('forbidden');
        return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { start };
