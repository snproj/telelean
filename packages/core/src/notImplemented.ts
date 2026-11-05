/**
 * Stub marker for frozen M1 contracts whose implementation belongs to a work package (docs/m1-plan.md section 9).
 * A builder replaces the stub body; nothing else may depend on the error. Tests of one package that need another
 * package's implementation can skip themselves with `isImplemented(() => fn(...))` until integration.
 */
export class NotImplementedError extends Error {
  constructor(readonly what: string) {
    super(`not implemented yet: ${what}`);
    this.name = 'NotImplementedError';
  }
}

export function notImplemented(what: string): never {
  throw new NotImplementedError(what);
}

/** True unless calling `probe` throws NotImplementedError (other errors count as implemented). */
export function isImplemented(probe: () => unknown): boolean {
  try {
    probe();
    return true;
  } catch (error) {
    return !(error instanceof NotImplementedError);
  }
}
