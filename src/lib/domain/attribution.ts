/**
 * Attribution: classify a first-touch source into a channel, and aggregate
 * events per channel. The snippet records the raw source; this decides the
 * bucket.
 */
export type SourceInfo = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
  landingPath?: string | null;
};

export type Channel =
  | "direct"
  | "product_hunt"
  | "reddit"
  | "hacker_news"
  | "x"
  | "linkedin"
  | "youtube"
  | "google"
  | "lovable"
  | "email"
  | "paid"
  | "app_store"
  | "other";

const HOST_CHANNELS: Array<[RegExp, Channel]> = [
  [/producthunt\.com$/i, "product_hunt"],
  [/reddit\.com$/i, "reddit"],
  [/news\.ycombinator\.com$/i, "hacker_news"],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/i, "x"],
  [/linkedin\.com$/i, "linkedin"],
  [/youtube\.com$|youtu\.be$/i, "youtube"],
  [/google\./i, "google"],
  [/bing\.com$|duckduckgo\.com$/i, "google"],
  [/lovable\.(dev|app)$/i, "lovable"],
];

const APP_STORE_SOURCES = new Set(["app_store", "play_store", "appstore", "playstore", "ios", "android"]);

export function classifyChannel(src: SourceInfo): Channel {
  const medium = (src.utmMedium ?? "").toLowerCase();
  const source = (src.utmSource ?? "").toLowerCase();
  if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "ads") return "paid";
  if (medium === "email" || source === "email" || source === "newsletter") return "email";
  if (source) {
    // A mobile app reporting an install names the store it came from. Google
    // Ads App campaigns can't be told apart per campaign client-side (that
    // needs SKAdNetwork / an MMP), so all store installs share one bucket.
    if (APP_STORE_SOURCES.has(source)) return "app_store";
    for (const [re, ch] of HOST_CHANNELS) if (re.test(source) || source === ch) return ch;
    if (source === "twitter" || source === "x") return "x";
    if (source === "ph" || source === "producthunt") return "product_hunt";
    if (source === "hn" || source === "hackernews") return "hacker_news";
    return "other";
  }
  if (src.referrer) {
    let host = "";
    try {
      host = new URL(src.referrer).hostname;
    } catch {
      return "other";
    }
    for (const [re, ch] of HOST_CHANNELS) if (re.test(host)) return ch;
    return "other";
  }
  return "direct";
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  direct: "Direct / unknown",
  product_hunt: "Product Hunt",
  reddit: "Reddit",
  hacker_news: "Hacker News",
  x: "X / Twitter",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  google: "Search",
  lovable: "Lovable",
  email: "Email",
  paid: "Paid ads",
  app_store: "App Store / Play Store",
  other: "Other referrals",
};

export type AttributionEventName = "pageview" | "install" | "signup" | "activation" | "checkout_view" | "purchase" | "return";
export const ATTRIBUTION_EVENTS: AttributionEventName[] = ["pageview", "install", "signup", "activation", "checkout_view", "purchase", "return"];

export type VisitorRow = { anonId: string; channel: Channel; events: Set<AttributionEventName>; revenueCents: number };

export type ChannelReport = {
  channel: Channel;
  visitors: number;
  /** Mobile app installs (first launch), reported by the app over HTTP - there is no snippet in a native app. */
  installs: number;
  signups: number;
  activations: number;
  checkoutViews: number;
  purchases: number;
  returned: number;
  revenueCents: number;
};

export function aggregateByChannel(visitors: Iterable<VisitorRow>): ChannelReport[] {
  const map = new Map<Channel, ChannelReport>();
  for (const v of visitors) {
    const row = map.get(v.channel) ?? { channel: v.channel, visitors: 0, installs: 0, signups: 0, activations: 0, checkoutViews: 0, purchases: 0, returned: 0, revenueCents: 0 };
    row.visitors += 1;
    if (v.events.has("install")) row.installs += 1;
    if (v.events.has("signup")) row.signups += 1;
    if (v.events.has("activation")) row.activations += 1;
    if (v.events.has("checkout_view")) row.checkoutViews += 1;
    if (v.events.has("purchase")) row.purchases += 1;
    if (v.events.has("return")) row.returned += 1;
    row.revenueCents += v.revenueCents;
    map.set(v.channel, row);
  }
  return [...map.values()].sort((a, b) => b.purchases - a.purchases || b.signups - a.signups || b.visitors - a.visitors);
}

/** One GA4 `first_open` row: the user's first-touch source / medium / campaign as GA4 reports them. */
export type InstallRow = { source: string | null; medium: string | null; campaign: string | null; installs: number };
export type InstallsByChannel = { channel: Channel; installs: number; campaigns: string[] };

const GA4_UNSET = new Set(["", "(direct)", "(none)", "(not set)", "(organic)"]);
function ga4Value(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return GA4_UNSET.has(t.toLowerCase()) ? null : t;
}

/**
 * Bucket GA4 first_open rows into channels. Installs can't be joined to the
 * snippet's anonymous ids (Firebase has its own), so this is a separate
 * count next to the channel table - same channel vocabulary, though, so an
 * app-campaign install (source google / medium cpc) lands in "Paid ads".
 */
export function aggregateInstalls(rows: InstallRow[]): InstallsByChannel[] {
  const map = new Map<Channel, InstallsByChannel>();
  for (const r of rows) {
    if (!(r.installs > 0)) continue;
    const channel = classifyChannel({ utmSource: ga4Value(r.source), utmMedium: ga4Value(r.medium), utmCampaign: ga4Value(r.campaign) });
    const row = map.get(channel) ?? { channel, installs: 0, campaigns: [] };
    row.installs += r.installs;
    const campaign = ga4Value(r.campaign);
    if (campaign && !row.campaigns.includes(campaign)) row.campaigns.push(campaign);
    map.set(channel, row);
  }
  return [...map.values()].sort((a, b) => b.installs - a.installs);
}
