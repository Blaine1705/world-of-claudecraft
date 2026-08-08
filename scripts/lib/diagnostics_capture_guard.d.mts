export declare function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean;
export declare function sameOrigin(origin: string | undefined, host: string | undefined): boolean;
export declare function diagnosticsReadAllowed(remoteAddress: string | undefined): boolean;
export declare function diagnosticsCaptureAllowed(
  remoteAddress: string | undefined,
  origin: string | undefined,
  host: string | undefined,
): boolean;
