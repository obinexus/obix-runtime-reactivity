/**
 * Cleanup — OBIX's own reactivity (Phase 6, N5). An effect scope collects what is made while it runs: the effects, the cleanups registered with `onScopeDispose` (a listener to
 * take away), and the scopes made inside it (unless they are detached). Stopping it stops all of them, once; a part of the page that goes away takes its bindings and its
 * listeners with it. A cleanup that throws does not keep the others from running; the first error is thrown once all have run.
 */
import { ObixRuntimeError } from './errors.js';

/** What a scope can stop. */
interface Stoppable {
  stop(): void;
}

let current: EffectScope | undefined;

export class EffectScope {
  #active = true;
  readonly #stoppables: Stoppable[] = [];
  readonly #cleanups: (() => void)[] = [];
  readonly #parent: EffectScope | undefined;

  constructor(detached: boolean) {
    this.#parent = detached ? undefined : current;
    if (this.#parent !== undefined) this.#parent.#stoppables.push(this);
  }

  get active(): boolean {
    return this.#active;
  }

  /** Run `fn` with this scope current: what it makes belongs to the scope. A stopped scope runs nothing. */
  run<T>(fn: () => T): T | undefined {
    if (!this.#active) return undefined;
    const previous = current;
    current = this;
    try {
      return fn();
    } finally {
      current = previous;
    }
  }

  /** @internal an effect made while the scope runs */
  collect(stoppable: Stoppable): void {
    this.#stoppables.push(stoppable);
  }

  /** @internal a cleanup registered while the scope runs */
  addCleanup(cleanup: () => void): void {
    this.#cleanups.push(cleanup);
  }

  /** Stop every effect and inner scope, and run every cleanup, once. */
  stop(): void {
    if (!this.#active) return;
    this.#active = false;
    let failed = false;
    let failure: unknown;
    const attempt = (fn: () => void): void => {
      try {
        fn();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    };
    for (const stoppable of this.#stoppables.splice(0)) attempt(() => stoppable.stop());
    for (const cleanup of this.#cleanups.splice(0)) attempt(cleanup);
    if (this.#parent !== undefined) {
      const siblings = this.#parent.#stoppables;
      const at = siblings.indexOf(this);
      if (at >= 0) siblings.splice(at, 1);
    }
    if (failed) throw failure;
  }
}

/** A new scope — inside the current one unless `detached`. */
export function effectScope(detached = false): EffectScope {
  return new EffectScope(detached);
}

/** The scope running now, if any. */
export function getCurrentScope(): EffectScope | undefined {
  return current;
}

/** Run `cleanup` when the current scope stops. */
export function onScopeDispose(cleanup: () => void): void {
  if (current === undefined) throw new ObixRuntimeError('OBIX_RUNTIME_SCOPE', 'onScopeDispose was called with no scope running: the cleanup would never run');
  current.addCleanup(cleanup);
}
