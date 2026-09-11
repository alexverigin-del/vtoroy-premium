export const MAX_API_ORIGIN: string;
export const MAX_ROOT_CA_SHA256: string;
export const DEFAULT_MAX_CA_PATH: string;
export function verifyMaxRootCertificate(
  pem: string | Buffer,
): import("node:crypto").X509Certificate;
export function createMaxApiFetch(certificatePath?: string): typeof fetch;
