import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.join(root, 'data', 'inventory-store.json');
const port = Number(process.env.PORT) || 8770;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.csv': 'text/csv; charset=utf-8',
};

async function readBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function isInsideRoot(filePath) {
  const relative = path.relative(root, filePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function handleInventoryApi(req, res, pathname) {
  if (pathname !== '/api/inventory') {
    return false;
  }

  if (req.method === 'GET') {
    try {
      const raw = await fs.readFile(storePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(raw);
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"error":"not_found"}');
        return true;
      }

      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"error":"read_failed"}');
    }

    return true;
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const body = await readBody(req);
      JSON.parse(body);
      await fs.mkdir(path.dirname(storePath), { recursive: true });
      await fs.writeFile(storePath, body, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"ok":true}');
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"error":"invalid_json"}');
    }

    return true;
  }

  res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end('{"error":"method_not_allowed"}');
  return true;
}

async function serveStatic(req, res, pathname) {
  let requestPath = decodeURIComponent(pathname);

  if (requestPath === '/') {
    requestPath = '/index.html';
  }

  const filePath = path.resolve(root, `.${requestPath}`);

  if (!isInsideRoot(filePath)) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (await handleInventoryApi(req, res, url.pathname)) {
      return;
    }

    await serveStatic(req, res, url.pathname);
  })
  .listen(port, () => {
    console.log(`IT Control Panel — Practice: http://127.0.0.1:${port}`);
    console.log(`Постоянные данные: data/inventory-store.json`);
  });
