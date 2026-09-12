import { getDb, schema } from "./db";
import type { ProductEventName } from "./domain/events";

/** Record a product event (PRD V1 §7). Never throws — analytics must not break a request. */
export async function track(name: ProductEventName, ctx: { userId?: string | null; appId?: string | null; props?: Record<string, unknown> }): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.productEvents).values({ name, userId: ctx.userId ?? null, appId: ctx.appId ?? null, props: ctx.props ?? {} });
  } catch (err) {
    console.warn("[track] failed", name, err);
  }
}
