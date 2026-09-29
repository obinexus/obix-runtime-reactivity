/**
 * Regression tests written for the survivors of the Phase 6 mutation campaign (tests/mutation/runtime-reactivity.json; docs/recovery/native-runtime.md §15): each states a
 * behaviour the reactivity promises and no earlier test held it to.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computed, effect, effectScope, flushJobs, hasPendingJobs, nextTick, onScopeDispose, queueJob, ref, untracked, watch } from 'obix-runtime-reactivity';

test('RX05: after a nested effect is made, what the outer effect reads is still its own dependency', () => {
  const inner = ref(0);
  const outer = ref(0);
  const seen = [];
  effect(() => {
    effect(() => { inner.value; });
    seen.push(outer.value);
  });
  outer.value = 1;
  assert.deepEqual(seen, [0, 1]);
  let reads = 0;
  effect(() => { untracked(() => inner.value); reads++; outer.value; });
  outer.value = 2;
  assert.equal(reads, 2, 'after untracked, the outer effect still depends on what it reads');
});

test('RX24: a stopped effect\'s scheduler is not called — even when it is stopped while a change is being told', () => {
  const r = ref(0);
  const calls = [];
  let second;
  effect(() => { r.value; }, { scheduler: () => { calls.push('first'); second.stop(); } });
  second = effect(() => { r.value; }, { scheduler: () => calls.push('second') });
  r.value = 1;
  assert.deepEqual(calls, ['first']);
});

test('RX28: a stopped effect depends on nothing', () => {
  const r = ref(0);
  const handle = effect(() => { r.value; });
  assert.equal(handle.deps.size, 1);
  handle.stop();
  assert.equal(handle.deps.size, 0);
});

test('RX32: a computed value already stale does not tell again: what depends on it is told once until it is read', () => {
  const r = ref(0);
  const c = computed(() => r.value * 2);
  let told = 0;
  effect(() => { c.value; }, { scheduler: () => { told++; } });
  r.value = 1;
  r.value = 2;
  r.value = 3;
  assert.equal(told, 1);
  assert.equal(c.value, 6);
});

test('RX40: the empty order runs before every other, and an order runs before the longer orders it begins', () => {
  const log = [];
  queueJob({ order: [1, 0], run: () => log.push('[1,0]') });
  queueJob({ order: [1], run: () => log.push('[1]') });
  queueJob({ order: [0], run: () => log.push('[0]') });
  queueJob({ order: [], run: () => log.push('[]') });
  flushJobs();
  assert.deepEqual(log, ['[]', '[0]', '[1]', '[1,0]']);
});

test('RX43: jobs of the same order run in the order they were queued', () => {
  const log = [];
  for (const name of ['a', 'b', 'c']) queueJob({ order: [3], run: () => log.push(name) });
  flushJobs();
  assert.deepEqual(log, ['a', 'b', 'c']);
});

test('RX45: a flush asked for while the queue flushes does not run the rest of the queue inside the job that asked', () => {
  const log = [];
  queueJob({ order: [0], run: () => { log.push('a starts'); flushJobs(); log.push('a ends'); } });
  queueJob({ order: [1], run: () => log.push('b') });
  flushJobs();
  assert.deepEqual(log, ['a starts', 'a ends', 'b']);
});

test('RX47: a job refused for never settling empties the queue — the jobs after it included', () => {
  const loop = { order: [0], run: () => queueJob(loop) };
  let later = 0;
  queueJob(loop);
  queueJob({ order: [5], run: () => { later++; } });
  assert.throws(() => flushJobs(), (error) => error.code === 'OBIX_RUNTIME_UPDATES');
  assert.equal(hasPendingJobs(), false);
  flushJobs();
  assert.equal(later, 0, 'the refused flush took the rest of its queue with it');
});

test('RX49: when several jobs throw, the flush throws the first error, after running them all', () => {
  const ran = [];
  queueJob({ order: [0], run: () => { ran.push(0); throw new Error('first'); } });
  queueJob({ order: [1], run: () => { ran.push(1); throw new Error('second'); } });
  assert.throws(() => flushJobs(), /first/);
  assert.deepEqual(ran, [0, 1]);
});

test('RX52: nextTick waits for the flush, and rejects with what it threw', async () => {
  queueJob({ order: [0], run: () => { throw new Error('in the flush'); } });
  await assert.rejects(nextTick(), /in the flush/);
  assert.equal(hasPendingJobs(), false);
});

test('RX64: when several cleanups throw, stopping the scope throws the first error, after running them all', () => {
  const ran = [];
  const scope = effectScope();
  scope.run(() => {
    onScopeDispose(() => { ran.push(1); throw new Error('first'); });
    onScopeDispose(() => { ran.push(2); throw new Error('second'); });
  });
  assert.throws(() => scope.stop(), /first/);
  assert.deepEqual(ran, [1, 2]);
});

test('RX71: what a sync watch\'s callback reads is not a dependency of the effect whose write set it off', () => {
  const r = ref(0);
  const s = ref(0);
  watch(() => r.value, () => { s.value; }, { sync: true });
  let runs = 0;
  effect(() => { runs++; r.value = 1; });
  s.value = 5;
  assert.equal(runs, 1, 'the writing effect does not run again for what the callback read');
});
