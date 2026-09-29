/**
 * N3 — `computed`, OBIX's own: a value worked out from refs (and other computed values) by a pure getter, LAZILY — not before it is read — and CACHED — worked out again only
 * when something it read has changed, and only when it is read again. What depends on it is told when what it depends on changes. It reads as a ref and cannot be written; one
 * that reads itself while it is being worked out is refused.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { batch, computed, effect, isRef, ref } from 'obix-runtime-reactivity';

test('a computed value is worked out when it is first read, not before, and then from its cache', () => {
  const count = ref(2);
  let runs = 0;
  const doubled = computed(() => { runs++; return count.value * 2; });
  assert.equal(runs, 0, 'lazy');
  assert.equal(doubled.value, 4);
  assert.equal(doubled.value, 4);
  assert.equal(runs, 1, 'cached');
});

test('after a change of what it read, it is worked out again — once, and only when it is read', () => {
  const count = ref(1);
  let runs = 0;
  const doubled = computed(() => { runs++; return count.value * 2; });
  doubled.value;
  count.value = 2;
  count.value = 3;
  assert.equal(runs, 1, 'not worked out until it is read');
  assert.equal(doubled.value, 6);
  assert.equal(doubled.value, 6);
  assert.equal(runs, 2);
});

test('an effect that reads a computed value runs again when what the computed value read changes', () => {
  const count = ref(0);
  const doubled = computed(() => count.value * 2);
  const seen = [];
  effect(() => seen.push(doubled.value));
  count.value = 1;
  count.value = 5;
  assert.deepEqual(seen, [0, 2, 10]);
});

test('computed values of computed values, and a diamond: each is worked out once per change', () => {
  const n = ref(1);
  let runs = { a: 0, b: 0, sum: 0 };
  const a = computed(() => { runs.a++; return n.value + 1; });
  const b = computed(() => { runs.b++; return n.value * 10; });
  const sum = computed(() => { runs.sum++; return a.value + b.value; });
  const seen = [];
  effect(() => seen.push(sum.value));
  n.value = 2;
  assert.deepEqual(seen.at(-1), 23);
  assert.deepEqual(runs, { a: 2, b: 2, sum: 2 });
  assert.equal(seen.at(-1), 23);
  batch(() => { n.value = 3; n.value = 4; });
  assert.equal(seen.at(-1), 45);
  assert.deepEqual(runs, { a: 3, b: 3, sum: 3 }, 'a batch of changes is one change');
});

test('a computed value depends on what its LAST run read', () => {
  const on = ref(true);
  const a = ref('a');
  const b = ref('b');
  let runs = 0;
  const pick = computed(() => { runs++; return on.value ? a.value : b.value; });
  pick.value;
  b.value = 'B';
  pick.value;
  assert.equal(runs, 1, 'b was not read');
  on.value = false;
  assert.equal(pick.value, 'B');
  a.value = 'A';
  pick.value;
  assert.equal(runs, 2, 'a is no longer read');
});

test('it reads as a ref, and cannot be written', () => {
  const c = computed(() => 1);
  assert.equal(isRef(c), true);
  assert.throws(() => { c.value = 2; }, TypeError);
});

test('a computed value that reads itself while it is worked out is refused, and one that throws is worked out again at the next read', () => {
  const self = computed(() => self.value + 1);
  assert.throws(() => self.value, (error) => error.code === 'OBIX_RUNTIME_CYCLE');
  const fail = ref(true);
  const risky = computed(() => { if (fail.value) throw new Error('not yet'); return 'ok'; });
  assert.throws(() => risky.value, /not yet/);
  fail.value = false;
  assert.equal(risky.value, 'ok');
});

test('the value of a computed value is what its getter returned, compared by nobody: a new array each time it is worked out', () => {
  const n = ref(1);
  const list = computed(() => [n.value]);
  const first = list.value;
  assert.equal(list.value, first, 'the cache');
  n.value = 2;
  assert.notEqual(list.value, first);
  assert.deepEqual(list.value, [2]);
});
