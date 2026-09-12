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

export function classifyChannel(src: SourceInfo): Channel {
  const medium = (src.utmMedium ?? "").toLowerCase();
  const source = (src.utmSource ?? "").toLowerCase();
  if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "ads") return "paid";
  if (medium === "email" || source === "email" || source === "newsletter") return "email";
  if (source) {
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
  other: "Other referrals",
};

export type AttributionEventName = "pageview" | "signup" | "activation" | "checkout_view" | "purchase" | "return";
export const ATTRIBUTION_EVENTS: AttributionEventName[] = ["pageview", "signup", "activation", "checkout_view", "purchase", "return"];

export type VisitorRow = { anonId: string; channel: Channel; events: Set<AttributionEventName>; revenueCents: number };

export type ChannelReport = {
  channel: Channel;
  visitors: number;
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
    const row = map.get(v.channel) ?? { channel: v.channel, visitors: 0, signups: 0, activations: 0, checkoutViews: 0, purchases: 0, returned: 0, revenueCents: 0 };
    row.visitors += 1;
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
