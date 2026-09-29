/**
 * Refs and effects — OBIX's own reactivity (Phase 6, N2).
 *
 * A `Ref` holds one value, SHALLOWLY: the canonical IR changes state only by assigning a whole value, so what a ref holds is never watched inside. Reading `ref.value` while an
 * effect runs makes the effect depend on the ref; writing a DIFFERENT value (`Object.is`) runs every effect that depends on it — or, when the effect has a scheduler, hands the
 * effect to it. An effect's dependencies are exactly what its LAST run read: before each run it lets go of all of them. An effect never runs again from inside its own run.
 * `batch` holds the effects back until the outermost batch ends, then runs each once; `untracked` reads without depending.
 */

import { getCurrentScope } from './scope.js';

/** Something that depends on refs: an effect, or a computed value. */
export interface Subscriber {
  /** the dependencies of the last run */
  readonly deps: Set<Dependency>;
  /** told that one of its dependencies changed */
  notify(): void;
}

/** What a ref or a computed value is to its subscribers. */
export class Dependency {
  readonly subscribers = new Set<Subscriber>();

  track(): void {
    const subscriber = active;
    if (subscriber === null || subscriber.deps.has(this)) return;
    subscriber.deps.add(this);
    this.subscribers.add(subscriber);
  }

  trigger(): void {
    batchDepth++;
    try {
      for (const subscriber of [...this.subscribers]) subscriber.notify();
    } finally {
      endBatch();
    }
  }
}

let active: Subscriber | null = null;

/** Run `fn` with `subscriber` as the one that depends on what is read (null: nobody). */
export function withSubscriber<T>(subscriber: Subscriber | null, fn: () => T): T {
  const previous = active;
  active = subscriber;
  try {
    return fn();
  } finally {
    active = previous;
  }
}

/** Let `subscriber` go of every dependency. */
export function release(subscriber: Subscriber): void {
  for (const dependency of subscriber.deps) dependency.subscribers.delete(subscriber);
  subscriber.deps.clear();
}

// ── batching ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

let batchDepth = 0;
const pending: EffectHandle[] = [];

function endBatch(): void {
  if (--batchDepth > 0) return;
  // the effects held back run now, each once; what they change in turn is held back again until they are all done
  while (pending.length > 0) {
    const effects = pending.splice(0);
    batchDepth++;
    try {
      for (const e of effects) {
        e.queued = false;
        if (e.active) e.run();
      }
    } finally {
      batchDepth--;
    }
  }
}

/** Run `fn`, holding every effect it causes back until it ends — then each runs once. Batches nest. */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    endBatch();
  }
}

/** Read inside `fn` without depending on what is read. */
export function untracked<T>(fn: () => T): T {
  return withSubscriber(null, fn);
}

// ── refs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const REF = Symbol('obix.ref');

export interface Ref<T> {
  value: T;
}

class RefImpl<T> implements Ref<T> {
  readonly [REF] = true;
  readonly #dependency = new Dependency();
  #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  get value(): T {
    this.#dependency.track();
    return this.#value;
  }

  set value(next: T) {
    if (Object.is(next, this.#value)) return;
    this.#value = next;
    this.#dependency.trigger();
  }
}

/** A ref holding `value`. */
export function ref<T>(value: T): Ref<T> {
  return new RefImpl(value);
}

/** Whether `value` is a ref (or a computed value, which reads as one). */
export function isRef(value: unknown): value is Ref<unknown> {
  return typeof value === 'object' && value !== null && (value as { [REF]?: boolean })[REF] === true;
}

/** Mark a class whose instances read as refs. */
export const REF_MARK: typeof REF = REF;

/** How many effects are running: made and not yet stopped. */
let live = 0;

/** How many effects — watches included — are running now: a page taken down must bring it back to where it was (leak accounting). */
export function liveEffects(): number {
  return live;
}

// ── effects ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EffectOptions {
  /** given the effect when what it read changes, instead of running it */
  readonly scheduler?: (effect: EffectHandle) => void;
  /** run after each run, once the effect no longer counts as running (what it does may change what the effect read) */
  readonly after?: () => void;
}

export class EffectHandle implements Subscriber {
  readonly deps = new Set<Dependency>();
  active = true;
  /** held back by a batch */
  queued = false;
  #running = false;
  readonly #fn: () => void;
  readonly #scheduler: ((effect: EffectHandle) => void) | undefined;
  readonly #after: (() => void) | undefined;

  constructor(fn: () => void, scheduler: ((effect: EffectHandle) => void) | undefined, after?: () => void) {
    this.#fn = fn;
    this.#scheduler = scheduler;
    this.#after = after;
    live++;
  }

  /** Run the effect now: let go of what it read, and read again. */
  run(): void {
    if (!this.active) return;
    release(this);
    this.#running = true;
    try {
      withSubscriber(this, this.#fn);
    } finally {
      this.#running = false;
    }
    this.#after?.();
  }

  notify(): void {
    if (!this.active || this.#running) return;
    if (this.#scheduler !== undefined) {
      this.#scheduler(this);
    } else if (!this.queued) {
      // an effect is told only by a trigger, which always batches: it runs when the batch ends, once
      this.queued = true;
      pending.push(this);
    }
  }

  /** Stop the effect: it runs no more, and depends on nothing. */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    live--;
    release(this);
  }
}

/** Run `fn` now, and again whenever what it read changes; it belongs to the scope running now. */
export function effect(fn: () => void, options: EffectOptions = {}): EffectHandle {
  const handle = new EffectHandle(fn, options.scheduler, options.after);
  // an effect belongs to the scope running when it is made: stopping the scope stops it
  getCurrentScope()?.collect(handle);
  handle.run();
  return handle;
}
