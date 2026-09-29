/**
 * `watch` — OBIX's own reactivity (Phase 6, N9). The source is read, and depended on, when the watch is made: that is the first value seen. After a change of what it read, the
 * source is read again; when its value is no longer the one seen last (`Object.is`), the callback runs with the new value and the previous one — never at the start. A QUEUED
 * watch (the default) is checked in the update queue at its ORDER (a component's watches are ordered before its view, so the view shows what they change in the same update), once
 * however many changes came before; a `sync` watch is checked as soon as the change is known (at the end of the batch it happens in). The callback reads without depending.
 * The watch belongs to the scope running when it is made; `stop()` — or stopping that scope — stops it.
 */
import { EffectHandle, effect, untracked } from './effect.js';
import { queueJob } from './scheduler.js';

export interface WatchOptions {
  /** checked as soon as a change is known, instead of in the update queue */
  readonly sync?: boolean;
  /** where it is checked in the update queue (lowest first; the empty order before every other) */
  readonly order?: readonly number[];
}

export function watch<T>(source: () => T, callback: (value: T, previous: T) => void, options: WatchOptions = {}): () => void {
  let seen = false;
  let last = undefined as T;
  let current = undefined as T;
  const check = (): void => {
    if (!seen) {
      seen = true;
      last = current;
      return;
    }
    if (Object.is(current, last)) return;
    const previous = last;
    last = current;
    untracked(() => callback(current, previous));
  };
  let handle: EffectHandle;
  if (options.sync === true) {
    handle = effect(() => {
      current = source();
    }, { after: check });
  } else {
    const job = {
      order: options.order ?? [],
      run: (): void => {
        if (!handle.active) return;
        handle.run();
        check();
      },
    };
    handle = effect(() => {
      current = source();
    }, { scheduler: () => queueJob(job) });
    check();
  }
  return () => handle.stop();
}
