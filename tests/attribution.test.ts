import { describe, expect, it } from "vitest";
import { aggregateByChannel, aggregateInstalls, classifyChannel } from "@/lib/domain/attribution";
import { installRowsFromReport } from "@/lib/sources/ga4";

describe("classifyChannel", () => {
  it("uses utm first", () => {
    expect(classifyChannel({ utmSource: "reddit", referrer: "https://google.com" })).toBe("reddit");
    expect(classifyChannel({ utmSource: "twitter" })).toBe("x");
    expect(classifyChannel({ utmSource: "ph" })).toBe("product_hunt");
    expect(classifyChannel({ utmSource: "google", utmMedium: "cpc" })).toBe("paid");
    expect(classifyChannel({ utmSource: "newsletter" })).toBe("email");
  });
  it("falls back to the referrer host", () => {
    expect(classifyChannel({ referrer: "https://www.reddit.com/r/lovable/comments/x" })).toBe("reddit");
    expect(classifyChannel({ referrer: "https://news.ycombinator.com/item?id=1" })).toBe("hacker_news");
    expect(classifyChannel({ referrer: "https://t.co/abc" })).toBe("x");
    expect(classifyChannel({ referrer: "https://www.google.com/" })).toBe("google");
    expect(classifyChannel({ referrer: "https://someblog.io/post" })).toBe("other");
    expect(classifyChannel({ referrer: "not a url" })).toBe("other");
  });
  it("buckets store installs into app_store", () => {
    expect(classifyChannel({ utmSource: "app_store" })).toBe("app_store");
    expect(classifyChannel({ utmSource: "play_store" })).toBe("app_store");
    expect(classifyChannel({ utmSource: "ios" })).toBe("app_store");
  });
  it("is direct with nothing", () => {
    expect(classifyChannel({})).toBe("direct");
  });
});

describe("aggregateByChannel", () => {
  it("aggregates per visitor then sorts by purchases", () => {
    const rows = aggregateByChannel([
      { anonId: "1", channel: "reddit", events: new Set(["pageview", "signup", "purchase"]), revenueCents: 1_900 },
      { anonId: "2", channel: "reddit", events: new Set(["pageview"]), revenueCents: 0 },
      { anonId: "3", channel: "x", events: new Set(["pageview", "signup"]), revenueCents: 0 },
    ]);
    expect(rows[0].channel).toBe("reddit");
    expect(rows[0].visitors).toBe(2);
    expect(rows[0].signups).toBe(1);
    expect(rows[0].purchases).toBe(1);
    expect(rows[0].revenueCents).toBe(1_900);
    expect(rows[1].channel).toBe("x");
  });
  it("counts installs per visitor", () => {
    const rows = aggregateByChannel([
      { anonId: "a", channel: "app_store", events: new Set(["install", "signup"]), revenueCents: 0 },
      { anonId: "b", channel: "app_store", events: new Set(["install"]), revenueCents: 0 },
      { anonId: "c", channel: "reddit", events: new Set(["pageview"]), revenueCents: 0 },
    ]);
    const store = rows.find((r) => r.channel === "app_store")!;
    expect(store.visitors).toBe(2);
    expect(store.installs).toBe(2);
    expect(store.signups).toBe(1);
    expect(rows.find((r) => r.channel === "reddit")!.installs).toBe(0);
  });
});

describe("aggregateInstalls", () => {
  it("buckets GA4 first_open rows by channel and treats GA4 placeholders as direct", () => {
    const rows = aggregateInstalls([
      { source: "google", medium: "cpc", campaign: "App campaign CZ", installs: 5 },
      { source: "google", medium: "cpc", campaign: "App campaign US", installs: 2 },
      { source: "(direct)", medium: "(none)", campaign: "(direct)", installs: 9 },
      { source: "(not set)", medium: "(not set)", campaign: "(not set)", installs: 1 },
      { source: "reddit", medium: "referral", campaign: null, installs: 0 },
    ]);
    expect(rows.map((r) => [r.channel, r.installs])).toEqual([
      ["direct", 10],
      ["paid", 7],
    ]);
    expect(rows[1].campaigns).toEqual(["App campaign CZ", "App campaign US"]);
  });
  it("reads a GA4 report into rows", () => {
    const rows = installRowsFromReport({ rows: [{ dimensionValues: [{ value: "google" }, { value: "cpc" }, { value: "X" }], metricValues: [{ value: "3" }] }] });
    expect(rows).toEqual([{ source: "google", medium: "cpc", campaign: "X", installs: 3 }]);
    expect(installRowsFromReport({})).toEqual([]);
  });
});
