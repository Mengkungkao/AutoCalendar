/** Upload sizes, shared by the browser and the server. */

/** The largest roster file you can pick. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Vercel refuses request bodies over 4.5 MB before they reach the app, and
 * that limit can't be raised. On Vercel the browser shrinks images to fit
 * under this; elsewhere it can send up to MAX_FILE_BYTES.
 */
export const VERCEL_UPLOAD_BYTES = 4_400_000;

/** 10485760 → "10 MB", 12900000 → "12.3 MB". */
export function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}
