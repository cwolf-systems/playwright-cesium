// Serves the demo scene and CesiumJS from node_modules, so the scene needs no network:
//   /           demo/
//   /cesium/    node_modules/cesium/Build/Cesium/
// Usage: node demo/server.mjs [port]

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCENE = join(ROOT, 'demo');
const CESIUM = join(ROOT, 'node_modules', 'cesium', 'Build', 'Cesium');
const PORT = Number(process.argv[2] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
};

/** The file a URL path names, or null outside the two roots. URL paths use `/` on every OS. */
function fileFor(pathname) {
  const path = decodeURIComponent(pathname);
  const [root, rest] = path.startsWith('/cesium/')
    ? [CESIUM, path.slice('/cesium/'.length)]
    : [SCENE, path === '/' ? 'index.html' : path.slice(1)];
  const file = resolve(root, ...rest.split('/'));
  return file.startsWith(root + sep) ? file : null;
}

createServer((request, response) => {
  const file = fileFor(new URL(request.url, 'http://localhost').pathname);
  if (!file || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(PORT, () => console.log(`demo scene on http://localhost:${PORT}/`));
