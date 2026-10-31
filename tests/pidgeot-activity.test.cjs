const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Compile the server modules in isolation so tests exercise their real query and
// response logic without a live database or production authentication.
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}
const { readGameActivity } = load('lib/pidgeot/activity.ts');
function database(results) {
  const queries = [];
  return {
    queries,
    from(table) {
      const query = { table, calls: [] };
      queries.push(query);
      const result = results[queries.length - 1];
      const chain = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
      for (const method of ['select', 'in', 'not', 'order', 'limit', 'eq', 'neq']) {
        chain[method] = (...args) => { query.calls.push([method, ...args]); return chain; };
      }
      return chain;
    },
  };
}
const ok = data => ({ data, error: null });
const won = { id: 'bet-won', user_id: 'player-a', amount: '10', status: 'cashed_out', cashout_multiplier: '1.75', payout: '17', auto_cashout: '1.75' };
const lost = { id: 'bet-lost', user_id: 'player-b', amount: '25', status: 'lost', cashout_multiplier: null, payout: '0' };

test('recorded snapshots preserve equal crash multipliers, payouts, and private ownership', async () => {
  const db = database([
    ok([{ id: 'round-new', crash_multiplier: '2.5' }, { id: 'round-old', crash_multiplier: '2.5' }]),
    ok([won, lost]), ok([won]),
    ok([
      { ...won, placed_at: '2026-10-31T22:00:00Z', pidgeot_rounds: { status: 'settled', crash_multiplier: '2.5' } },
      { ...lost, placed_at: '2026-10-30T22:00:00Z', pidgeot_rounds: [{ status: 'crashed', crash_multiplier: '1.2' }] },
    ]),
    ok([{ user_id: 'player-a', username: 'Pilot A' }, { user_id: 'player-b', username: 'Pilot B' }]),
  ]);
  const activity = await readGameActivity(db, 'round-new', 'player-a');
  assert.equal(activity.crashes.length, 2);
  assert.notEqual(activity.crashes[0].id, activity.crashes[1].id);
  assert.equal(activity.bets[0].cashout, 1.75);
  assert.equal(activity.bets[0].payout, 17);
  assert.equal(activity.bets[0].isOwn, true);
  assert.equal(activity.bets[1].isOwn, false);
  assert.equal(activity.bets[1].cashout, undefined);
  assert.equal(activity.bets[0].autoCashout, null);
  assert.equal(activity.ownBets[0].autoCashout, 1.75);
  assert.equal(activity.history[0].profit, 7);
  assert.equal(activity.history[1].profit, -25);
  assert.equal(activity.history[1].crashPoint, 1.2);
  assert.ok(db.queries[0].calls.some(c => c[0] === 'in' && c[1] === 'status' && c[2].join() === 'crashed,settled'));
  for (const query of [db.queries[2], db.queries[3]]) {
    assert.ok(query.calls.some(c => c[0] === 'eq' && c[1] === 'user_id' && c[2] === 'player-a'));
  }
  assert.ok(db.queries[3].calls.some(c => c[0] === 'in' && c[1] === 'pidgeot_rounds.status'));
  assert.equal('user_id' in activity.bets[0], false);
  assert.ok(!JSON.stringify(activity).includes('server_seed'));
});

test('guest requests do not query any personal bet history', async () => {
  const db = database([ok([]), ok([won]), ok([{ user_id: 'player-a', username: 'Pilot A' }])]);
  const activity = await readGameActivity(db, 'round', null);
  assert.deepEqual(activity.history, []);
  assert.deepEqual(activity.ownBets, []);
  assert.equal(activity.bets[0].isOwn, false);
  assert.equal(db.queries.length, 3);
  assert.equal(db.queries.filter(q => q.table === 'pidgeot_bets').length, 1);
});

test('database errors fail instead of returning a false empty history', async () => {
  const db = database([{ data: null, error: { message: 'Unavailable' } }, ok([])]);
  await assert.rejects(readGameActivity(db, 'round', null), /could not be loaded/);
});

const roundId = '12345678-1234-1234-1234-123456789abc';
function activityRoute(auth, read) {
  return load('app/api/pidgeot/activity/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/api-auth': { getAuthenticatedClient: auth },
    '@/lib/supabase/admin': { createAdminClient: () => ({}) },
    '@/lib/pidgeot/activity': { readGameActivity: read },
  });
}
test('activity endpoint validates round IDs before querying', async () => {
  const { GET } = activityRoute(() => assert.fail('auth not expected'), () => assert.fail('query not expected'));
  assert.equal((await GET(new Request('http://localhost/api/pidgeot/activity?roundId=invalid'))).status, 400);
});
test('activity endpoint scopes personal data to the verified user and disables caching', async () => {
  const { GET } = activityRoute(async () => ({ user: { id: 'verified-user' }, response: null }), async (_db, id, user) => {
    assert.equal(id, roundId);
    assert.equal(user, 'verified-user');
    return { history: [] };
  });
  const response = await GET(new Request(`http://localhost/api/pidgeot/activity?roundId=${roundId}&userId=someone-else`, { headers: { Authorization: 'Bearer test-session' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('invalid authentication cannot fall back to a public query', async () => {
  const { GET } = activityRoute(async () => ({ response: Response.json({ error: 'Invalid' }, { status: 401 }) }), () => assert.fail('query not expected'));
  const response = await GET(new Request(`http://localhost/api/pidgeot/activity?roundId=${roundId}`, { headers: { Authorization: 'Bearer invalid-session' } }));
  assert.equal(response.status, 401);
});
test('controller never exposes unpublished crash results or seed fields', async () => {
  const { POST } = load('app/api/pidgeot/controller/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async () => ok({ id: roundId, status: 'flying', crash_multiplier: 42, server_seed: 'unpublished', server_seed_hash: 'commitment' }) }) },
  });
  const { round } = await (await POST()).json();
  assert.equal(round.crash_multiplier, null);
  assert.equal('server_seed' in round, false);
  assert.equal('server_seed_hash' in round, false);
});
