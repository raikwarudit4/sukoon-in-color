export type ShiprocketMode = "mock" | "sandbox" | "live" | "disabled";

export function getShiprocketMode(): ShiprocketMode {
  const mode = process.env.SHIPROCKET_MODE?.trim().toLowerCase();
  if (mode === "mock" || mode === "sandbox" || mode === "live") return mode;
  return "disabled";
}

export function getShiprocketBaseUrl(mode: "sandbox" | "live") {
  return mode === "sandbox"
    ? "https://api-sandbox.shiprocket.in/v1/external"
    : "https://apiv2.shiprocket.in/v1/external";
}

export function getShiprocketCredentials(mode: "sandbox" | "live") {
  return mode === "sandbox"
    ? { email: process.env.SHIPROCKET_SANDBOX_EMAIL, password: process.env.SHIPROCKET_SANDBOX_PASSWORD }
    : { email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD };
}

export async function getShiprocketToken(mode: "sandbox" | "live") {
  const { email, password } = getShiprocketCredentials(mode);
  if (!email || !password) {
    const label = mode === "sandbox" ? "Sandbox" : "Live";
    throw new Error(`${label} Shiprocket credentials are not configured on the server.`);
  }
  const response = await fetch(`${getShiprocketBaseUrl(mode)}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as { token?: string } | null;
  if (!response.ok || !body?.token) throw new Error("Shiprocket authentication failed. Check the selected environment credentials.");
  return body.token;
}
