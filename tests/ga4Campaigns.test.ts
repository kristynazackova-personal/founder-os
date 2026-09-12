import { describe, expect, it, vi, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { fetchGa4Campaigns } from "@/lib/sources/ga4";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const credentials = { propertyId: "552881470", serviceAccountJson: JSON.stringify({ type: "service_account", client_email: "sa@p.iam.gserviceaccount.com", private_key: privateKey }) };

type Reply = { ok: boolean; status: number; body: unknown };
const reply = (r: Reply) => ({ ok: r.ok, status: r.status, text: async () => JSON.stringify(r.body) });
const badRequest = (message: string): Reply => ({ ok: false, status: 400, body: { error: { code: 400, message, status: "INVALID_ARGUMENT" } } });

/** Stub Google: the token endpoint always works; each runReport is routed by the dimensions it asked for. */
function stubGoogle(route: (dimensions: string[]) => Reply) {
  vi.stubGlobal("fetch", async (url: unknown, init?: { body?: string }) => {
    if (String(url).includes("oauth2.googleapis.com/token")) return reply({ ok: true, status: 200, body: { access_token: "tok" } });
    const body = JSON.parse(init?.body ?? "{}") as { dimensions?: Array<{ name: string }> };
    return reply(route((body.dimensions ?? []).map((d) => d.name)));
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchGa4Campaigns", () => {
  it("reports what GA4 refused instead of throwing, and still returns the funnel", async () => {
    stubGoogle((dimensions) => {
      if (dimensions.includes("eventName")) {
        return { ok: true, status: 200, body: { rows: [{ dimensionValues: [{ value: "(not set)" }, { value: "first_open" }], metricValues: [{ value: "34" }] }] } };
      }
      return badRequest("Please remove advertiserAdCost. It is incompatible with sessionGoogleAdsCampaignName.");
    });
    const got = await fetchGa4Campaigns(credentials);
    expect(got.events).toEqual([{ campaign: "(not set)", event: "first_open", users: 34 }]);
    expect(got.ads).toEqual([]);
    expect(got.notes.length).toBeGreaterThan(0);
    expect(got.notes[0].message).toContain("incompatible");
    expect(got.notes[0].message).toContain("HTTP 400");
  });

  it("never asks for cost without a dimension — GA4 rejects that as incompatible", async () => {
    const asked: string[][] = [];
    stubGoogle((dimensions) => {
      asked.push(dimensions);
      if (dimensions.includes("eventName")) return { ok: true, status: 200, body: { rows: [] } };
      return { ok: true, status: 200, body: { rows: [{ dimensionValues: [{ value: "(not set)" }], metricValues: [{ value: "0" }, { value: "0" }, { value: "0" }] }] } };
    });
    const got = await fetchGa4Campaigns(credentials);
    expect(asked.every((d) => d.length > 0)).toBe(true);
    expect(got.scope).toBe("total");
    expect(got.notes).toEqual([]);
  });

  it("keeps a campaign split when a dimension does report cost", async () => {
    stubGoogle((dimensions) => {
      if (dimensions.includes("eventName")) return { ok: true, status: 200, body: { rows: [] } };
      if (dimensions.includes("sessionGoogleAdsCampaignName")) {
        return { ok: true, status: 200, body: { rows: [{ dimensionValues: [{ value: "App CZ" }], metricValues: [{ value: "400" }, { value: "9000" }, { value: "120.00" }] }] } };
      }
      return { ok: true, status: 200, body: { rows: [] } };
    });
    const got = await fetchGa4Campaigns(credentials);
    expect(got.scope).toBe("sessionGoogleAdsCampaignName");
    expect(got.ads[0]).toMatchObject({ campaign: "App CZ", costCents: 12_000 });
    expect(got.notes).toEqual([]);
  });

  it("propagates a failure of the funnel-events query, which is the card's backbone", async () => {
    stubGoogle(() => badRequest("Field eventName is not a valid dimension."));
    await expect(fetchGa4Campaigns(credentials)).rejects.toThrow();
  });
});
