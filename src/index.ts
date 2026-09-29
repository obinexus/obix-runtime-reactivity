/**
 * obix-runtime-reactivity — the reactivity of OBIX's native runtime, its own (Phase 6, docs/recovery/native-runtime.md): refs, computed values, `watch`,
 * effects with dependency tracking, batching, the ordered update queue, and effect scopes for cleanup. No framework and no DOM: nothing here is forwarded to Vue or anything else.
 */
export { ObixRuntimeError } from './errors.js';
export type { ObixRuntimeErrorCode } from './errors.js';
export { EffectHandle, batch, effect, isRef, liveEffects, ref, untracked } from './effect.js';
export type { EffectOptions, Ref } from './effect.js';
export { computed } from './computed.js';
export type { ComputedRef } from './computed.js';
export { EffectScope, effectScope, getCurrentScope, onScopeDispose } from './scope.js';
export { watch } from './watch.js';
export type { WatchOptions } from './watch.js';
export { flushJobs, hasPendingJobs, nextTick, queueJob } from './scheduler.js';
export type { Job } from './scheduler.js';
