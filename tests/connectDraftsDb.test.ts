import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_MEMORY = "1";
delete process.env.DATABASE_URL;

describe("draft secrets round trip", () => {
  let appId: string;
  beforeAll(async () => {
    const { getDb, schema } = await import("@/lib/db");
    const db = await getDb();
    const [user] = await db.insert(schema.users).values({ email: "draft@x.co", passwordHash: "x" }).returning();
    const [app] = await db.insert(schema.apps).values({ userId: user.id, name: "D", siteKey: "fos_draft" }).returning();
    appId = app.id;
  });

  it("stores secrets encrypted, exposes only their names, and fills blanks on connect", async () => {
    const { saveDraft, getDraft, getDraftSecrets, withDraftSecrets, clearDraft } = await import("@/lib/services/connectChecklists");
    const { getDb, schema } = await import("@/lib/db");
    await saveDraft(appId, "appstore", { issuerId: "iss", keyId: "K1", privateKey: "-----BEGIN PRIVATE KEY-----\nabc" });
    const view = await getDraft(appId, "appstore");
    expect(view.fields).toEqual({ issuerId: "iss", keyId: "K1" });
    expect(view.secretsOnFile).toEqual(["privateKey"]);
    const db = await getDb();
    const [row] = await db.select().from(schema.connectChecklists);
    expect(row.draftSecretsEnc).not.toContain("BEGIN PRIVATE KEY");
    expect(await getDraftSecrets(appId, "appstore")).toEqual({ privateKey: "-----BEGIN PRIVATE KEY-----\nabc" });

    // Saving again without the secret keeps it; a blank submission gets it back.
    await saveDraft(appId, "appstore", { issuerId: "iss2", privateKey: "" });
    const fd = new FormData();
    fd.set("issuerId", "iss2");
    fd.set("privateKey", "");
    const merged = await withDraftSecrets(appId, "appstore", fd);
    expect(merged.privateKey).toBe("-----BEGIN PRIVATE KEY-----\nabc");

    // Postgres: a redacted string typed back gets its password from the draft.
    await saveDraft(appId, "postgres", { connectionString: "postgresql://ro:pw@h:5432/db?sslmode=require", usersTable: "users" });
    const fd2 = new FormData();
    fd2.set("connectionString", "postgresql://ro@h:5432/db?sslmode=require");
    expect((await withDraftSecrets(appId, "postgres", fd2)).connectionString).toBe("postgresql://ro:pw@h:5432/db?sslmode=require");

    await clearDraft(appId, "appstore");
    expect((await getDraft(appId, "appstore")).secretsOnFile).toEqual([]);
  });
});

describe("connect checklist round trip", () => {
  let appId: string;
  beforeAll(async () => {
    const { getDb, schema } = await import("@/lib/db");
    const db = await getDb();
    const [user] = await db.insert(schema.users).values({ email: "chk@x.co", passwordHash: "x" }).returning();
    const [app] = await db.insert(schema.apps).values({ userId: user.id, name: "C", siteKey: "fos_chk" }).returning();
    appId = app.id;
  });

  it("keeps ticked steps and drops unticked ones, per source", async () => {
    const { setChecklistStep, getChecklist } = await import("@/lib/services/connectChecklists");
    expect(await getChecklist(appId, "googleads")).toEqual([]);
    await setChecklistStep(appId, "googleads", "customer-id", true);
    await setChecklistStep(appId, "googleads", "oauth", true);
    expect((await getChecklist(appId, "googleads")).sort()).toEqual(["customer-id", "oauth"]);
    // ticking the same step twice must not duplicate it
    await setChecklistStep(appId, "googleads", "oauth", true);
    expect((await getChecklist(appId, "googleads")).filter((s) => s === "oauth")).toHaveLength(1);
    await setChecklistStep(appId, "googleads", "oauth", false);
    expect(await getChecklist(appId, "googleads")).toEqual(["customer-id"]);
    // another source keeps its own list
    expect(await getChecklist(appId, "stripe")).toEqual([]);
  });
});
