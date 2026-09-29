/**
 * The update queue of OBIX's native runtime (Phase 6, N2). A job — a DOM update, a component's effects — is queued, once however many times it is asked for, and the queue is
 * flushed after the current task (a microtask) or when `flushJobs` is called: the job of the lowest ORDER first, where an order is a list of numbers compared item by item (the
 * runtime orders by component, then by phase, then by creation, so that a parent is updated before its children). A job queued while the queue flushes runs in the same flush,
 * in its place by order. A job queued again and again in one flush — updates that never settle — is refused after a hundred runs; a job that throws does not keep the rest of
 * the queue from running, and the first error is thrown once the queue is empty.
 */
import { ObixRuntimeError } from './errors.js';

export interface Job {
  /** where it runs in a flush: lowest first, compared item by item */
  readonly order: readonly number[];
  run(): void;
}

const MAX_RUNS = 100;

const queue: Job[] = [];
let scheduled: Promise<void> | null = null;
let flushing = false;

function compare(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/** Queue `job` for the next flush (once). */
export function queueJob(job: Job): void {
  if (queue.includes(job)) return;
  // in order: after every job of a lower or equal order
  let at = queue.length;
  while (at > 0 && compare(queue[at - 1]!.order, job.order) > 0) at--;
  queue.splice(at, 0, job);
  if (scheduled === null && !flushing) {
    scheduled = Promise.resolve().then(() => {
      scheduled = null;
      flushJobs();
    });
  }
}

/** Run every queued job now, in order. */
export function flushJobs(): void {
  if (flushing) return;
  flushing = true;
  const runs = new Map<Job, number>();
  let failed = false;
  let failure: unknown;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      const count = (runs.get(job) ?? 0) + 1;
      runs.set(job, count);
      if (count > MAX_RUNS + 1) {
        queue.length = 0;
        throw new ObixRuntimeError('OBIX_RUNTIME_UPDATES', `updates did not settle: one job was queued again ${MAX_RUNS} times in one flush`);
      }
      try {
        job.run();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  } finally {
    flushing = false;
  }
  if (failed) throw failure;
}

/** Whether a job is waiting for a flush. */
export function hasPendingJobs(): boolean {
  return queue.length > 0;
}

/** Resolves once the jobs queued before it was called have run — rejects with what the flush threw, so that an update that failed is never silent. */
export async function nextTick(): Promise<void> {
  if (scheduled !== null) await scheduled;
}
