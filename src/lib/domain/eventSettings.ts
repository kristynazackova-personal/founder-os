/**
 * Which of an analytics source's events Founder OS may read, and from when.
 * Stored on `revenue_sources.meta.events`; asked right after an analytics
 * tool (GA4, Mixpanel) is connected and editable any time from the
 * connection's settings. Pure — parsing, the allow-check and the date floor.
 */
export type EventMode = "all" | "selected";
export type EventHistory = "all_time" | "forward";

export type EventSettings = {
  mode: EventMode;
  /** Event names Founder OS may read when mode is "selected". */
  selected: string[];
  /** "all_time": every collected event; "forward": only events from `since` on. */
  history: EventHistory;
  /** ISO timestamp the settings were saved — the floor for "forward". */
  since: string;
};

export const EVENT_SETTINGS_KEY = "events";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Settings from a source row's meta; null when the founder was never asked (read everything). */
export function parseEventSettings(meta: unknown): EventSettings | null {
  const raw = meta && typeof meta === "object" ? (meta as Record<string, unknown>)[EVENT_SETTINGS_KEY] : null;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const mode: EventMode = o.mode === "selected" ? "selected" : "all";
  const selected = Array.isArray(o.selected) ? o.selected.filter((e): e is string => typeof e === "string" && e.trim() !== "").map((e) => e.trim()) : [];
  const history: EventHistory = o.history === "forward" ? "forward" : "all_time";
  const since = str(o.since) && !Number.isNaN(new Date(str(o.since) as string).getTime()) ? (str(o.since) as string) : new Date(0).toISOString();
  return { mode, selected, history, since };
}

/** Build settings from the form: a checked list only matters in "selected" mode. */
export function eventSettingsFromForm(input: { mode: string | null; selected: string[]; history: string | null }, now = new Date()): EventSettings {
  const mode: EventMode = input.mode === "selected" ? "selected" : "all";
  return {
    mode,
    selected: mode === "selected" ? [...new Set(input.selected.map((s) => s.trim()).filter(Boolean))] : [],
    history: input.history === "forward" ? "forward" : "all_time",
    since: now.toISOString(),
  };
}

export function isEventAllowed(settings: EventSettings | null, event: string): boolean {
  if (!settings || settings.mode === "all") return true;
  return settings.selected.includes(event);
}

/** Start of a read window: `days` back, floored at `since` when only forward events may be read. */
export function readFrom(settings: EventSettings | null, days: number, now = new Date()): Date {
  const windowStart = new Date(now.getTime() - days * 86_400_000);
  if (!settings || settings.history !== "forward") return windowStart;
  const since = new Date(settings.since);
  return since > windowStart ? since : windowStart;
}

/** GA4 wants YYYY-MM-DD. */
export function ga4Date(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function describeEventSettings(settings: EventSettings | null, totalKnown: number | null): string {
  if (!settings) return "Reading all events (not yet reviewed).";
  const which = settings.mode === "all" ? "Reading all events" : `Reading ${settings.selected.length}${totalKnown !== null ? ` of ${totalKnown}` : ""} event${settings.selected.length === 1 ? "" : "s"}`;
  const when = settings.history === "forward" ? `from ${new Date(settings.since).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} on` : "all time";
  return `${which} · ${when}.`;
}
