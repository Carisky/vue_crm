const localDevelopmentHosts = new Set(["localhost", "127.0.0.1", "::1"]);

type BasicAuthRequest = {
  hostname: string;
  isTrustedInternalRequest: boolean;
};

export function requiresBasicAuth({
  hostname,
  isTrustedInternalRequest,
}: BasicAuthRequest) {
  if (isTrustedInternalRequest) return false;
  return !localDevelopmentHosts.has(hostname.toLowerCase());
}
