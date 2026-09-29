/**
 * N9 — `watch`, OBIX's own: the source is read — and depended on — when the watch is made; its callback runs when the source's value is no longer the one seen last
 * (`Object.is`), with the new value and the previous one, and not at the start. A queued watch runs in the update queue at its ORDER (so a component's watches run before its
 * view is updated), once however many changes came before; a `sync` watch runs as soon as the change is known. Stopping it — or its scope — stops it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { batch, computed, effectScope, flushJobs, queueJob, ref, watch } from 'obix-runtime-reactivity';

test('the callback runs when the value changes, with the new and the previous value — not at the start, and not for a write of the same value', () => {
  const count = ref(0);
  const seen = [];
  watch(() => count.value, (value, previous) => seen.push([value, previous]), { sync: true });
  assert.deepEqual(seen, []);
  count.value = 1;
  count.value = 1;
  count.value = 3;
  assert.deepEqual(seen, [[1, 0], [3, 1]]);
});

test('a queued watch runs in the update queue, once for many changes, compared with the value seen last', () => {
  const count = ref(0);
  const seen = [];
  watch(() => count.value, (value, previous) => seen.push([value, previous]));
  count.value = 1;
  count.value = 2;
  assert.deepEqual(seen, [], 'nothing until the queue runs');
  flushJobs();
  assert.deepEqual(seen, [[2, 0]]);
  count.value = 3;
  count.value = 2;
  flushJobs();
  assert.deepEqual(seen, [[2, 0]], 'back to the value seen last: no change');
});

test('queued watches run in their order among the other jobs', () => {
  const r = ref(0);
  const log = [];
  queueJob({ order: [5, 1], run: () => log.push('render') });
  watch(() => r.value, () => log.push('late watch'), { order: [9, 0] });
  watch(() => r.value, () => log.push('early watch'), { order: [5, 0] });
  r.value = 1;
  flushJobs();
  assert.deepEqual(log, ['early watch', 'render', 'late watch']);
});

test('a watch whose callback changes what another watches: the other runs in the same flush, and a change back before it runs is no change', () => {
  const a = ref(0);
  const b = ref(0);
  const log = [];
  watch(() => a.value, (v) => { log.push(`a ${v}`); b.value = v * 10; }, { order: [0] });
  watch(() => b.value, (v) => log.push(`b ${v}`), { order: [1] });
  a.value = 1;
  flushJobs();
  assert.deepEqual(log, ['a 1', 'b 10']);
});

test('the source is depended on as its last read says; a computed value can be watched', () => {
  const on = ref(false);
  const x = ref(1);
  const seen = [];
  const doubled = computed(() => x.value * 2);
  watch(() => (on.value ? doubled.value : -1), (v) => seen.push(v), { sync: true });
  x.value = 2;
  assert.deepEqual(seen, [], 'x was not read');
  on.value = true;
  x.value = 3;
  assert.deepEqual(seen, [4, 6]);
});

test('stop() — and stopping its scope — stops a watch; a change in a batch is seen once, at its end', () => {
  const r = ref(0);
  const seen = [];
  const stop = watch(() => r.value, (v) => seen.push(v), { sync: true });
  batch(() => { r.value = 1; r.value = 2; });
  assert.deepEqual(seen, [2]);
  stop();
  r.value = 3;
  const scope = effectScope();
  scope.run(() => watch(() => r.value, (v) => seen.push(`scoped ${v}`), { sync: true }));
  scope.stop();
  r.value = 4;
  assert.deepEqual(seen, [2]);
});

test('a watch that never settles is refused by the queue', () => {
  const r = ref(0);
  watch(() => r.value, (v) => { r.value = v + 1; }, { order: [0] });
  r.value = 1;
  assert.throws(() => flushJobs(), (error) => error.code === 'OBIX_RUNTIME_UPDATES');
});
