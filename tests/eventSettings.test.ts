import { describe, expect, it } from "vitest";
import { describeEventSettings, eventSettingsFromForm, ga4Date, isEventAllowed, parseEventSettings, readFrom } from "@/lib/domain/eventSettings";

const NOW = new Date("2026-09-12T12:00:00Z");

describe("event settings", () => {
  it("is null when never asked, and everything is allowed", () => {
    expect(parseEventSettings({})).toBeNull();
    expect(parseEventSettings(null)).toBeNull();
    expect(isEventAllowed(null, "sign_up")).toBe(true);
  });
  it("parses stored settings defensively", () => {
    const s = parseEventSettings({ events: { mode: "selected", selected: ["sign_up", " purchase ", 3, ""], history: "forward", since: "2026-09-01T00:00:00.000Z" } })!;
    expect(s.mode).toBe("selected");
    expect(s.selected).toEqual(["sign_up", "purchase"]);
    expect(s.history).toBe("forward");
    expect(isEventAllowed(s, "sign_up")).toBe(true);
    expect(isEventAllowed(s, "first_open")).toBe(false);
    expect(parseEventSettings({ events: { mode: "bogus", since: "not a date" } })).toMatchObject({ mode: "all", history: "all_time", since: new Date(0).toISOString() });
  });
  it("builds settings from the form; a checked list only counts in selected mode", () => {
    expect(eventSettingsFromForm({ mode: "all", selected: ["a"], history: "forward" }, NOW)).toEqual({ mode: "all", selected: [], history: "forward", since: NOW.toISOString() });
    expect(eventSettingsFromForm({ mode: "selected", selected: ["a", "a", " b "], history: null }, NOW).selected).toEqual(["a", "b"]);
  });
  it("floors the read window at `since` only for forward-only settings", () => {
    const forward = eventSettingsFromForm({ mode: "all", selected: [], history: "forward" }, new Date("2026-09-10T00:00:00Z"));
    expect(ga4Date(readFrom(forward, 30, NOW))).toBe("2026-09-10");
    const allTime = eventSettingsFromForm({ mode: "all", selected: [], history: "all_time" }, new Date("2026-09-10T00:00:00Z"));
    expect(ga4Date(readFrom(allTime, 30, NOW))).toBe("2026-08-13");
    expect(ga4Date(readFrom(null, 30, NOW))).toBe("2026-08-13");
    // a `since` older than the window changes nothing
    const old = eventSettingsFromForm({ mode: "all", selected: [], history: "forward" }, new Date("2026-01-01T00:00:00Z"));
    expect(ga4Date(readFrom(old, 30, NOW))).toBe("2026-08-13");
  });
  it("describes the choice", () => {
    expect(describeEventSettings(null, null)).toContain("all events");
    expect(describeEventSettings(eventSettingsFromForm({ mode: "selected", selected: ["a", "b"], history: "forward" }, NOW), 10)).toBe("Reading 2 of 10 events · from Sep 12, 2026 on.");
  });
});
