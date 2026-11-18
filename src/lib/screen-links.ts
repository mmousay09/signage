export type ScreenLink = { type: "pair"; code: string } | { type: "screen"; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const pairingUrl = (origin: string, code: string) => `${origin}/screens/new?code=${code}`;
export const screenUrl = (origin: string, id: string) => `${origin}/screens/${id}`;
export const isPairingCode = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9]{5}$/.test(value);

export function parseScreenLink(text: string, origin: string): ScreenLink | null {
  const value = text.trim();
  if (isPairingCode(value)) return { type: "pair", code: value };
  try {
    const url = new URL(value);
    if (url.origin !== origin) return null;
    const code = url.searchParams.get("code");
    if (url.pathname === "/screens/new" && isPairingCode(code)) return { type: "pair", code };
    const id = url.pathname.match(/^\/screens\/([^/]+)$/)?.[1];
    return id && UUID.test(id) ? { type: "screen", id } : null;
  } catch {
    return null;
  }
}

export const safeNextPath = (value: string | null | undefined) =>
  value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : null;
