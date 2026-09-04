const localDevelopmentHosts = new Set(["localhost", "127.0.0.1", "::1"]);

type BasicAuthRequest = {
  hostname: string;
  isTrustedInternalRequest: boolean;
  pathname?: string;
};

export function requiresBasicAuth({
  hostname,
  isTrustedInternalRequest,
  pathname = "",
}: BasicAuthRequest) {
  if (isTrustedInternalRequest) return false;
  if (
    pathname === "/telegram" ||
    pathname === "/api/telegram/webhook" ||
    pathname === "/api/integrations/mattermost/events" ||
    pathname.startsWith("/api/telegram/mini/") ||
    pathname.startsWith("/api/agent/v1/") ||
    pathname.startsWith("/api/_nuxt_icon/")
  ) {
    return false;
  }
  return !localDevelopmentHosts.has(hostname.toLowerCase());
}
