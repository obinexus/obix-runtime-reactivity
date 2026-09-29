/**
 * N5 — cleanup: an effect scope collects the effects made while it runs, the cleanups registered in it (`onScopeDispose`) and the scopes made inside it; stopping it stops all of
 * them — a part of a page that goes away takes its bindings and its listeners with it. A detached scope belongs to no other.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { effect, effectScope, getCurrentScope, onScopeDispose, ref } from 'obix-runtime-reactivity';

test('stopping a scope stops the effects made while it ran, and runs its cleanups once', () => {
  const r = ref(0);
  const seen = [];
  const cleaned = [];
  const scope = effectScope();
  const result = scope.run(() => {
    effect(() => seen.push(r.value));
    onScopeDispose(() => cleaned.push('listener'));
    return 'made';
  });
  assert.equal(result, 'made');
  r.value = 1;
  scope.stop();
  scope.stop();
  r.value = 2;
  assert.deepEqual(seen, [0, 1]);
  assert.deepEqual(cleaned, ['listener']);
  assert.equal(scope.active, false);
});

test('a scope made inside another is stopped with it; stopped alone, it leaves the outer one running', () => {
  const r = ref(0);
  const seen = [];
  const outer = effectScope();
  let inner;
  outer.run(() => {
    effect(() => seen.push(`outer ${r.value}`));
    inner = effectScope();
    inner.run(() => effect(() => seen.push(`inner ${r.value}`)));
  });
  inner.stop();
  r.value = 1;
  assert.deepEqual(seen, ['outer 0', 'inner 0', 'outer 1']);
  const again = effectScope();
  let nested;
  again.run(() => { nested = effectScope(); nested.run(() => effect(() => seen.push(`nested ${r.value}`))); });
  again.stop();
  r.value = 2;
  assert.equal(nested.active, false);
  assert.equal(seen.includes('nested 2'), false);
});

test('a detached scope belongs to no other, and the current scope is the one running', () => {
  const outer = effectScope();
  let detached;
  outer.run(() => {
    assert.equal(getCurrentScope(), outer);
    detached = effectScope(true);
  });
  assert.equal(getCurrentScope(), undefined);
  outer.stop();
  assert.equal(detached.active, true);
});

test('running a stopped scope does nothing and returns undefined; onScopeDispose outside a scope is refused', () => {
  const scope = effectScope();
  scope.stop();
  assert.equal(scope.run(() => 'x'), undefined);
  assert.throws(() => onScopeDispose(() => {}), (error) => error.code === 'OBIX_RUNTIME_SCOPE');
});

test('a cleanup that throws does not keep the others from running; the first error is thrown once all have run', () => {
  const ran = [];
  const scope = effectScope();
  scope.run(() => {
    onScopeDispose(() => { ran.push(1); throw new Error('first'); });
    onScopeDispose(() => ran.push(2));
  });
  assert.throws(() => scope.stop(), /first/);
  assert.deepEqual(ran, [1, 2]);
});
