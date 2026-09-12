import { describe, expect, it } from "vitest";
import { aggregateByChannel, classifyChannel } from "@/lib/domain/attribution";

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
