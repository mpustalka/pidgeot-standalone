const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => mocks[name], module, module.exports);
  return module.exports;
}
const helper = load('lib/prize-image.ts');
function setup({ admin = true, authenticated = true, fail = false } = {}) {
  const images = new Map();
  const route = load('app/api/prize-images/route.ts', {
    '@/lib/prize-image': helper,
    '@netlify/blobs': { getStore: () => ({
      async set(id, bytes) { if (fail) throw new Error('Storage unavailable'); images.set(id, bytes); },
      async get(id) { return images.get(id) ?? null; }
    }) },
    '@/lib/supabase/api-auth': { getAuthenticatedClient: async () => ({
      response: authenticated ? null : Response.json({ error: 'Authentication required.' }, { status: 401 }),
      supabase: { rpc: async () => ({ data: admin }) }
    }) }
  });
  return { images, route, async upload(file) {
    const form = new FormData(); form.set('image', file);
    return route.POST(new Request('https://example.com/api/prize-images', { method: 'POST', body: form }));
  } };
}
test('upload and public retrieval preserve the selected image bytes and MIME type', async () => {
  const s = setup();
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const response = await s.upload(new File([bytes], 'selected.png', { type: 'image/png' }));
  assert.equal(response.status, 200);
  const { url } = await response.json();
  const image = await s.route.GET(new Request(`https://example.com${url}`));
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes);
  const replacement = await s.upload(new File(['different image'], 'replacement.png', { type: 'image/png' }));
  assert.notEqual((await replacement.json()).url, url);
});
test('only authenticated admins can upload', async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ admin: false }, 403]]) {
    const s = setup(options);
    assert.equal((await s.upload(new File(['image'], 'image.png', { type: 'image/png' }))).status, status);
    assert.equal(s.images.size, 0);
  }
});
test('empty, unsupported, and oversized files are rejected without writing', async () => {
  const s = setup();
  for (const file of [new File([], 'empty.png', { type: 'image/png' }), new File(['html'], 'page.html', { type: 'text/html' }), new File([new Uint8Array(helper.maxUploadBytes + 1)], 'large.png', { type: 'image/png' })]) {
    assert.equal((await s.upload(file)).status, 400);
  }
  assert.equal(s.images.size, 0);
});
test('storage failure does not return a successful image URL', async () => {
  const s = setup({ fail: true });
  const response = await s.upload(new File(['image'], 'image.webp', { type: 'image/webp' }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).url, undefined);
});
test('missing images and invalid keys return 404', async () => {
  const { route } = setup();
  for (const id of ['invalid', 'd1f214f0-cc12-4b7a-942e-5ce4f943fe11.png']) {
    assert.equal((await route.GET(new Request(`https://example.com/api/prize-images?id=${id}`))).status, 404);
  }
});
test('small images retain original bytes and oversized animated GIFs receive clear errors', async () => {
  const file = new File(['original'], 'photo.png', { type: 'image/png' });
  assert.equal(await helper.preparePrizeImage(file), file);
  await assert.rejects(helper.preparePrizeImage(new File([new Uint8Array(helper.maxUploadBytes + 1)], 'animated.gif', { type: 'image/gif' })), /GIFs must be 3 MB/);
});
