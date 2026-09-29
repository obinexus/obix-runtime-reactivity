/**
 * Computed values — OBIX's own reactivity (Phase 6, N3). A computed value is worked out by a pure getter LAZILY (not before it is first read) and CACHED: when something it read
 * changes it is only marked stale, and what depends on it is told; it is worked out again at the next read, once however many changes came before. Its dependencies are what its
 * last run read. It reads as a ref and cannot be written. A getter that reads its own computed value while it is being worked out is refused (`OBIX_RUNTIME_CYCLE`); a getter that
 * throws leaves the value stale, to be worked out again at the next read.
 */
import { Dependency, REF_MARK, release, withSubscriber } from './effect.js';
import type { Subscriber } from './effect.js';
import { ObixRuntimeError } from './errors.js';

export interface ComputedRef<T> {
  readonly value: T;
}

class ComputedImpl<T> implements Subscriber, ComputedRef<T> {
  readonly [REF_MARK] = true;
  readonly deps = new Set<Dependency>();
  readonly #dependency = new Dependency();
  readonly #getter: () => T;
  #value: T | undefined = undefined;
  #stale = true;
  #working = false;

  constructor(getter: () => T) {
    this.#getter = getter;
  }

  notify(): void {
    if (this.#stale) return;
    this.#stale = true;
    this.#dependency.trigger();
  }

  get value(): T {
    this.#dependency.track();
    if (this.#stale) {
      if (this.#working) throw new ObixRuntimeError('OBIX_RUNTIME_CYCLE', 'a computed value reads itself while it is worked out');
      release(this);
      this.#working = true;
      try {
        this.#value = withSubscriber(this, this.#getter);
        this.#stale = false;
      } finally {
        this.#working = false;
      }
    }
    return this.#value as T;
  }

  set value(_: T) {
    throw new TypeError('a computed value cannot be written');
  }
}

/** A computed value worked out by `getter`. */
export function computed<T>(getter: () => T): ComputedRef<T> {
  return new ComputedImpl(getter);
}
