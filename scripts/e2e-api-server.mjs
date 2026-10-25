import http from 'node:http';

// This helper is exclusively for a disposable local PostgreSQL browser test.
// Never derive its database from an injected production connection.
if (process.env.PRC_E2E_REAL_DATABASE !== '1') throw new Error('Real browser tests must be enabled explicitly.');
const testUrl = process.env.PRC_TEST_DATABASE_URL;
if (!testUrl || process.env.DATABASE_URL !== testUrl) throw new Error('A dedicated disposable test database is required.');
const connection = new URL(testUrl);
const host = connection.searchParams.get('host') || connection.hostname;
if (!(host.startsWith('/') || ['localhost', '127.0.0.1', '::1'].includes(host))) throw new Error('Only a local database is allowed.');
if (!/^prc_browser_[a-z0-9]+_test$/.test(connection.pathname.slice(1))) throw new Error('The browser database must belong to the disposable runner.');
if (!process.env.SESSION_SECRET) throw new Error('The test runner must provide a synthetic session secret.');
delete process.env.SUPABASE_DATABASE_URL;
const port = Number(process.env.PRC_E2E_API_PORT ?? '4301');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local API port.');
const { default: handler } = await import('../artifacts/prc-pharmacie/dist/functions/api.mjs');

const server = http.createServer(async (request, response) => {
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 1_000_000) {
        response.writeHead(413, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'Local test payload too large.' }));
        return;
      }
      chunks.push(chunk);
    }
    const method = request.method || 'GET';
    const url = `http://${request.headers.host || `127.0.0.1:${port}`}${request.url || '/'}`;
    const result = await handler(new Request(url, {
      method,
      headers: request.headers,
      ...(['GET', 'HEAD'].includes(method) ? {} : { body: Buffer.concat(chunks) }),
    }));
    result.headers.forEach((value, name) => { if (name !== 'set-cookie') response.setHeader(name, value); });
    const cookies = result.headers.getSetCookie();
    if (cookies.length) response.setHeader('set-cookie', cookies);
    response.writeHead(result.status);
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    // Do not print requests, bodies, cookies, credentials or connection strings.
    console.error('Local browser API failed:', error instanceof Error ? error.name : 'unknown');
    if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'Local browser API failure.' }));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Disposable browser API listening on local port ${port}.`));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => { server.close(() => process.exit(0)); server.closeAllConnections(); });
}
