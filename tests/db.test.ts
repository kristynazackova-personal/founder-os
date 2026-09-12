import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_MEMORY = "1";
delete process.env.DATABASE_URL;

describe("database", () => {
  let db: Awaited<ReturnType<typeof import("@/lib/db").getDb>>;
  let schema: typeof import("@/lib/db").schema;
  beforeAll(async () => {
    const mod = await import("@/lib/db");
    db = await mod.getDb();
    schema = mod.schema;
  });

  it("applies migrations and round-trips a user + app", async () => {
    const [user] = await db.insert(schema.users).values({ email: "a@b.co", passwordHash: "x" }).returning();
    expect(user.id).toBeTruthy();
    const [app] = await db.insert(schema.apps).values({ userId: user.id, name: "Test", siteKey: "sk_test" }).returning();
    const found = await db.select().from(schema.apps).where(eq(schema.apps.userId, user.id));
    expect(found[0].id).toBe(app.id);
    expect(found[0].checkoutMode).toBe("test");
  });
});
