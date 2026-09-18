/** The window, read from the URL. Four complete weeks unless asked otherwise. */
export function weeksFrom(search: { [key: string]: string | string[] | undefined }): number {
  const raw = search.weeks;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(value ?? "4", 10);
  return Number.isNaN(n) ? 4 : Math.min(Math.max(n, 1), 26);
}
