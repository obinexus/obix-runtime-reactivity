/**
 * N10 — leak accounting: `liveEffects()` is how many effects (watches included) are running — made and not yet stopped. A page that is taken down must bring it back to where it
 * was; a stopped effect counts once, however often it is stopped.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { effect, effectScope, liveEffects, ref, watch } from 'obix-runtime-reactivity';

test('effects and watches count while they run, and not once they are stopped — directly or with their scope', () => {
  const before = liveEffects();
  const r = ref(0);
  const e = effect(() => r.value);
  const stopWatch = watch(() => r.value, () => {});
  assert.equal(liveEffects(), before + 2);
  e.stop();
  e.stop();
  stopWatch();
  assert.equal(liveEffects(), before);
  const scope = effectScope();
  scope.run(() => {
    effect(() => r.value);
    watch(() => r.value, () => {}, { sync: true });
    effectScope().run(() => effect(() => r.value));
  });
  assert.equal(liveEffects(), before + 3);
  scope.stop();
  assert.equal(liveEffects(), before);
});
