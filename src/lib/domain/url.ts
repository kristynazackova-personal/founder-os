/**
 * One way to read a URL a founder typed.
 *
 * Settings and the stage-1 prefill both take a website address from a form,
 * and they have to agree: if one stores `https://x.com` and the other stores
 * `x.com/`, the prefill panel shows a different address from the settings
 * page and neither is wrong. Same function, same answer.
 *
 * Pure. No DB, no env, no network.
 */

/** A typed address as a canonical absolute URL, or null when it is not one. */
export function normalizeUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    // A bare trailing slash is noise in a stored value and shows up as a
    // spurious difference when comparing "did this change?".
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Whether two typed addresses mean the same site. */
export const sameUrl = (a: string | null, b: string | null): boolean =>
  (a ? normalizeUrl(a) : null) === (b ? normalizeUrl(b) : null);
