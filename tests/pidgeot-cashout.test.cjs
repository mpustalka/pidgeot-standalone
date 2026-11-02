const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/pidgeot/cashout.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const compiled = { exports: {} };
new Function('module', 'exports', code)(compiled, compiled.exports);
const { cashoutDetails, resolveCashout } = compiled.exports;
const won = { status: 'cashed_out', payout: '17', cashout_multiplier: '1.75' };
function database(result) {
  return { from(table) {
    assert.equal(table, 'pidgeot_bets');
    return { select(fields) {
      assert.equal(fields, 'status,payout,cashout_multiplier');
      return { eq(key, value) {
        assert.equal(key, 'id'); assert.equal(value, 'bet-1');
        return { maybeSingle: async () => result };
      } };
    } };
  } };
}
test('cashout accepts object and table RPC responses', async () => {
  for (const result of [won, [won]]) {
    assert.deepEqual(await resolveCashout({}, 'bet-1', result), { payout: 17, multiplier: 1.75 });
  }
});
test('void cashout responses confirm the saved winning bet', async () => {
  for (const result of [null, [], {}, true]) {
    assert.deepEqual(await resolveCashout(database({ data: won }), 'bet-1', result), { payout: 17, multiplier: 1.75 });
  }
});
test('missing and invalid payout details are never treated as zero winnings', () => {
  for (const result of [null, {}, { payout: null, cashout_multiplier: 2 }, { payout: '', cashout_multiplier: 2 }, { payout: -1, cashout_multiplier: 2 }, { payout: 10, cashout_multiplier: 'invalid' }]) {
    assert.equal(cashoutDetails(result), null);
  }
});
test('unconfirmed records and read failures defer to polling without a false cashout failure', async () => {
  for (const result of [{ data: { ...won, status: 'active' } }, { data: null }, { error: { message: 'offline' } }]) {
    assert.equal(await resolveCashout(database(result), 'bet-1', null), null);
  }
  assert.equal(await resolveCashout({ from() { throw new Error('offline'); } }, 'bet-1', null), null);
});
