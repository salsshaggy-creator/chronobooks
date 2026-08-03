const http = require('http');
const express = require('express');
const testApp = express();
testApp.use(express.json());
testApp.delete('/test/:id', (req, res) => {
  console.log('HIT test delete', req.params, req.body);
  res.json({ ok: true, body: req.body });
});

function rawReq(opts, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, raw: data }));
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function main() {
  const server = testApp.listen(0);
  const port = server.address().port;
  const del = await rawReq({ hostname: 'localhost', port, path: '/test/123', method: 'DELETE', headers: { 'Content-Type': 'application/json' } }, { confirmName: 'x' });
  console.log('status:', del.status, 'raw:', del.raw);
  server.close();
}
main();
