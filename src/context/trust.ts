export class UntrustedError extends Error {
  constructor() { super("Workspace is not trusted: Hitch will not select or launch executables or open sockets."); }
}
/** Call before any process spawn, socket connect, or Herdr mutation. */
export function assertTrusted(isTrusted: boolean): void {
  if (!isTrusted) throw new UntrustedError();
}
