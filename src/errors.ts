/**
 * The one error of OBIX's native runtime. Every refusal carries a CODE — an OBIX-owned word that says what kind of refusal it is — and a message that names the component or the
 * value concerned. A runtime refuses what it cannot run; it never renders half of it, and never renders something else instead.
 *
 *   OBIX_RUNTIME_SCHEMA       what was given is not a component of the canonical IR of the schema this runtime reads
 *   OBIX_RUNTIME_INVALID_IR   a node, a text part, an expression or a step of a kind the IR does not have, or a reference the component does not declare
 *   OBIX_RUNTIME_VALUE        a value the page cannot hold where the IR puts it: an array or an object as an attribute
 *   OBIX_RUNTIME_INPUT        a component is given an input it does not declare
 *   OBIX_RUNTIME_LINK         an invocation that cannot be linked: no component registered for its dependency, an input or an output the invoked component does not declare
 *   OBIX_RUNTIME_MOUNT        the application cannot be put where it was asked to go
 *   OBIX_RUNTIME_UPDATES      updates that do not settle: a job queued again and again in one flush
 *   OBIX_RUNTIME_CYCLE        a computed value that reads itself while it is worked out
 *   OBIX_RUNTIME_SCOPE        a cleanup registered with no scope to run it
 */
export type ObixRuntimeErrorCode =
  | 'OBIX_RUNTIME_SCHEMA'
  | 'OBIX_RUNTIME_INVALID_IR'
  | 'OBIX_RUNTIME_VALUE'
  | 'OBIX_RUNTIME_INPUT'
  | 'OBIX_RUNTIME_LINK'
  | 'OBIX_RUNTIME_MOUNT'
  | 'OBIX_RUNTIME_UPDATES'
  | 'OBIX_RUNTIME_CYCLE'
  | 'OBIX_RUNTIME_SCOPE';

export class ObixRuntimeError extends Error {
  readonly code: ObixRuntimeErrorCode;

  constructor(code: ObixRuntimeErrorCode, message: string) {
    super(message);
    this.name = 'ObixRuntimeError';
    this.code = code;
  }
}
