/**
 * One password (APP_PASSWORD) unlocks the site. Signing in sets an httpOnly
 * cookie holding an expiry time and an HMAC of it, keyed by the password, so
 * there is no session store and changing APP_PASSWORD signs every device out.
 * Web Crypto only, so the same code runs in the proxy and in route handlers.
 */

export const SESSION_COOKIE = "ac_session";
export const SESSION_DAYS = 400;

const encoder = new TextEncoder();

export function sitePassword(): string | null {
  const password = process.env.APP_PASSWORD;
  return password && password.length > 0 ? password : null;
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signingKey(password: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(`autocalendar-session-v1\u0000${password}`));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(password: string, now = Date.now()): Promise<string> {
  const expires = String(Math.floor(now / 1000) + SESSION_DAYS * 86_400);
  const signature = await crypto.subtle.sign("HMAC", await signingKey(password), encoder.encode(expires));
  return `${expires}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token: string | undefined, password: string | null, now = Date.now()): Promise<boolean> {
  if (!token || !password) return false;
  const [expires, signature, extra] = token.split(".");
  if (!expires || !signature || extra !== undefined || !/^\d{1,12}$/.test(expires)) return false;
  if (Number(expires) * 1000 <= now) return false;
  const bytes = fromBase64Url(signature);
  if (!bytes) return false;
  return crypto.subtle.verify("HMAC", await signingKey(password), bytes, encoder.encode(expires));
}

/** Compares digests so the time taken doesn't depend on how much of the password was right. */
export async function passwordMatches(input: string, password: string | null): Promise<boolean> {
  if (!password) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(input)),
    crypto.subtle.digest("SHA-256", encoder.encode(password)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

type CookieReader = { get(name: string): { value: string } | undefined };

export async function isSignedIn(cookies: CookieReader): Promise<boolean> {
  return verifySessionToken(cookies.get(SESSION_COOKIE)?.value, sitePassword());
}
