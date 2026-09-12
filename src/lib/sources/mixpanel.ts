import { jsonFetch } from "../checkout/provider";
import type { AnalyticsAdapter, MixpanelCredentials } from "./types";

/**
 * Mixpanel, read with a service account through the raw Export API: we count
 * distinct users of the founder's signup / activation / visitor events over
 * the last 30 days. No JQL (deprecated), no Insights bookmarks.
 */
const HOST: Record<MixpanelCredentials["region"], string> = {
  us: "https://data.mixpanel.com",
  eu: "https://data-eu.mixpanel.com",
  in: "https://data-in.mixpanel.com",
};
const API_HOST: Record<MixpanelCredentials["region"], string> = { us: "https://mixpanel.com", eu: "https://eu.mixpanel.com", in: "https://in.mixpanel.com" };

function auth(c: MixpanelCredentials): string {
  return `Basic ${Buffer.from(`${c.serviceUser}:${c.serviceSecret}`).toString("base64")}`;
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Distinct users in a newline-delimited export. */
export function countDistinctUsers(jsonl: string): number {
  const ids = new Set<string>();
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as { properties?: { distinct_id?: string | number; $user_id?: string | number; $device_id?: string } };
      const id = e.properties?.distinct_id ?? e.properties?.$user_id ?? e.properties?.$device_id;
      if (id !== undefined && id !== null) ids.add(String(id));
    } catch {
      /* skip malformed line */
    }
  }
  return ids.size;
}

async function distinctUsers(c: MixpanelCredentials, event: string, from: Date, to: Date): Promise<number> {
  const u = new URL(`${HOST[c.region]}/api/2.0/export`);
  u.searchParams.set("project_id", c.projectId);
  u.searchParams.set("from_date", day(from));
  u.searchParams.set("to_date", day(to));
  u.searchParams.set("event", JSON.stringify([event]));
  const res = await fetch(u, { headers: { Authorization: auth(c), Accept: "text/plain" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mixpanel export ${res.status}: ${text.slice(0, 200)}`);
  return countDistinctUsers(text);
}

export const mixpanelAdapter: AnalyticsAdapter = {
  async fetchSignals(credentials, now = new Date()) {
    const c = credentials as MixpanelCredentials;
    const from = new Date(now.getTime() - 30 * 86_400_000);
    const [signups, activations, visitors] = await Promise.all([
      distinctUsers(c, c.signupEvent, from, now),
      c.activationEvent ? distinctUsers(c, c.activationEvent, from, now) : Promise.resolve(null),
      c.visitorEvent ? distinctUsers(c, c.visitorEvent, from, now) : Promise.resolve(null),
    ]);
    return { signups30d: signups, activations30d: activations, visitors30d: visitors };
  },
};

/** Validate the service account + project cheaply (event names list). */
export async function probeMixpanel(c: MixpanelCredentials): Promise<{ ok: true; events: string[] } | { ok: false; error: string }> {
  try {
    const u = new URL(`${API_HOST[c.region]}/api/2.0/events/names`);
    u.searchParams.set("project_id", c.projectId);
    u.searchParams.set("type", "general");
    u.searchParams.set("limit", "255");
    const names = await jsonFetch<string[]>(u.toString(), { headers: { Authorization: auth(c), Accept: "application/json" } });
    return { ok: true, events: Array.isArray(names) ? names : [] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
