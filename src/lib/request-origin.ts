/**
 * Check browser POST origins against the public host. Behind a hosting proxy,
 * request.url can describe the internal origin while Host / X-Forwarded-Host
 * still identify the public site the browser contacted.
 */
export function hasAllowedRequestOrigin(request: Request) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return true;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  if ((origin.protocol !== "https:" && origin.protocol !== "http:") || origin.username || origin.password) {
    return false;
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const requestHost = forwardedHost || request.headers.get("host");
  if (requestHost && origin.host.toLowerCase() !== requestHost.toLowerCase()) {
    return false;
  }

  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  if (forwardedProtocol && origin.protocol !== `${forwardedProtocol}:`) {
    return false;
  }

  // Without proxy headers, retain a strict scheme + host comparison.
  if (!forwardedHost && !forwardedProtocol) {
    try {
      return origin.origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }

  return Boolean(requestHost);
}
