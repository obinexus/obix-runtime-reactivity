/**
 * N2 — `ref` and the machinery under it, OBIX's own: a ref holds one value; reading it inside an effect makes the effect depend on it; writing a DIFFERENT value (`Object.is`)
 * runs — or schedules — what depends on it; an effect's dependencies are the ones its LAST run read; a stopped effect runs no more; `batch` holds effects back until it ends;
 * `untracked` reads without depending. The job queue runs jobs once each, in their order, after the current task (or at `flushJobs`), and refuses an update that never settles.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { batch, effect, flushJobs, hasPendingJobs, isRef, nextTick, queueJob, ref, untracked } from 'obix-runtime-reactivity';

test('a ref holds a value, and an effect that reads it runs again when a different value is written', () => {
  const count = ref(0);
  const seen = [];
  effect(() => seen.push(count.value));
  count.value = 1;
  count.value = 1;
  count.value = 2;
  assert.deepEqual(seen, [0, 1, 2], 'the same value written again changes nothing');
  assert.equal(isRef(count), true);
  assert.equal(isRef({ value: 1 }), false);
});

test('a different value is what Object.is says: NaN is NaN, and -0 is not 0', () => {
  const n = ref(NaN);
  let runs = 0;
  effect(() => { n.value; runs++; });
  n.value = NaN;
  assert.equal(runs, 1);
  n.value = 0;
  n.value = -0;
  assert.equal(runs, 3);
});

test('a ref is shallow: it holds the very array or object it is given', () => {
  const list = [1, 2];
  const r = ref(list);
  assert.equal(r.value, list);
  let runs = 0;
  effect(() => { r.value; runs++; });
  r.value = list;
  assert.equal(runs, 1, 'the same array written again changes nothing');
  r.value = [...list];
  assert.equal(runs, 2);
});

test('an effect depends on what its LAST run read: a branch not taken is not a dependency', () => {
  const on = ref(true);
  const a = ref('a');
  const b = ref('b');
  const seen = [];
  effect(() => seen.push(on.value ? a.value : b.value));
  b.value = 'B';
  assert.deepEqual(seen, ['a'], 'b was not read');
  on.value = false;
  a.value = 'A';
  assert.deepEqual(seen, ['a', 'B'], 'a is no longer read');
  b.value = 'BB';
  assert.deepEqual(seen, ['a', 'B', 'BB']);
});

test('a stopped effect runs no more, and stopping twice is nothing', () => {
  const r = ref(0);
  let runs = 0;
  const handle = effect(() => { r.value; runs++; });
  handle.stop();
  handle.stop();
  r.value = 1;
  assert.equal(runs, 1);
  assert.equal(handle.active, false);
});

test('an effect with a scheduler is scheduled, not run, when what it read changes; run() runs it and reads again', () => {
  const r = ref(0);
  const seen = [];
  const scheduled = [];
  const handle = effect(() => seen.push(r.value), { scheduler: (h) => scheduled.push(h) });
  r.value = 1;
  r.value = 2;
  assert.deepEqual(seen, [0]);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0], handle);
  handle.run();
  assert.deepEqual(seen, [0, 2]);
});

test('an effect created while another runs belongs to neither: each depends on what it reads itself', () => {
  const outer = ref(0);
  const inner = ref(0);
  const log = [];
  effect(() => {
    log.push(`outer ${outer.value}`);
  });
  effect(() => {
    effect(() => log.push(`inner ${inner.value}`));
  });
  inner.value = 1;
  assert.deepEqual(log, ['outer 0', 'inner 0', 'inner 1'], 'the inner effect ran again, and the effect that made it did not');
});

test('batch holds the effects back until it ends, and each runs once', () => {
  const a = ref(0);
  const b = ref(0);
  const seen = [];
  effect(() => seen.push(a.value + b.value));
  const result = batch(() => {
    a.value = 1;
    b.value = 2;
    return 'done';
  });
  assert.equal(result, 'done');
  assert.deepEqual(seen, [0, 3]);
  batch(() => batch(() => { a.value = 5; }));
  assert.deepEqual(seen, [0, 3, 7]);
});

test('untracked reads without depending', () => {
  const a = ref(0);
  const b = ref(0);
  let runs = 0;
  effect(() => { a.value; untracked(() => b.value); runs++; });
  b.value = 1;
  assert.equal(runs, 1);
  a.value = 1;
  assert.equal(runs, 2);
});

test('an effect that writes what it reads does not run itself again from inside its own run', () => {
  const r = ref(0);
  let runs = 0;
  effect(() => {
    runs++;
    if (r.value < 3) r.value = r.value + 1;
  });
  assert.equal(runs, 1);
  assert.equal(r.value, 1);
});

// ── the job queue ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('queued jobs run once each, in their order, after the current task — nextTick waits for them', async () => {
  const log = [];
  const job = (name, order) => ({ order, run: () => log.push(name) });
  const c = job('c', [2, 0]);
  queueJob(c);
  queueJob(job('a', [1, 5]));
  queueJob(c);
  queueJob(job('b', [1, 7]));
  assert.deepEqual(log, [], 'nothing runs synchronously');
  assert.equal(hasPendingJobs(), true);
  await nextTick();
  assert.deepEqual(log, ['a', 'b', 'c']);
  assert.equal(hasPendingJobs(), false);
});

test('flushJobs runs the queue now; a job queued while it runs runs in this flush, in its place by order', () => {
  const log = [];
  const late = { order: [1, 1], run: () => log.push('late') };
  queueJob({ order: [1, 0], run: () => { log.push('first'); queueJob(late); } });
  queueJob({ order: [3], run: () => log.push('last') });
  flushJobs();
  assert.deepEqual(log, ['first', 'late', 'last']);
});

test('a job that keeps queuing itself is refused after a hundred runs in one flush, and the queue is left empty', () => {
  let runs = 0;
  const loop = { order: [0], run: () => { runs++; queueJob(loop); } };
  queueJob(loop);
  assert.throws(() => flushJobs(), (error) => error.code === 'OBIX_RUNTIME_UPDATES' && /settle/.test(error.message));
  assert.equal(runs, 101);
  assert.equal(hasPendingJobs(), false);
});

test('a job that throws leaves the rest of the queue to run, and the error is thrown once the queue is empty', () => {
  const log = [];
  queueJob({ order: [0], run: () => { throw new Error('boom'); } });
  queueJob({ order: [1], run: () => log.push('after') });
  assert.throws(() => flushJobs(), /boom/);
  assert.deepEqual(log, ['after']);
  assert.equal(hasPendingJobs(), false);
});
