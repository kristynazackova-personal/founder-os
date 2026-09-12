import { describe, expect, it } from "vitest";
import { countDistinctUsers } from "@/lib/sources/mixpanel";

describe("countDistinctUsers", () => {
  it("counts distinct ids across an export", () => {
    const lines = [
      JSON.stringify({ event: "User Signup", properties: { distinct_id: "u1", time: 1 } }),
      JSON.stringify({ event: "User Signup", properties: { distinct_id: "u1", time: 2 } }),
      JSON.stringify({ event: "User Signup", properties: { distinct_id: 42 } }),
      JSON.stringify({ event: "User Signup", properties: { $device_id: "d9" } }),
      "not json",
      "",
    ].join("\n");
    expect(countDistinctUsers(lines)).toBe(3);
    expect(countDistinctUsers("")).toBe(0);
  });
});
