/**
 * Running an AI generation after the browser has gone.
 *
 * Every generation used to happen inside the server action the page was
 * awaiting. Two things followed: a founder who closed the tab cancelled their
 * own job, and a model that took longer than the deadline produced an error
 * message rather than an answer. Neither is acceptable for work that takes
 * minutes and costs money.
 *
 * So the action now START it and returns a job id. The work runs detached on
 * the server, writes its outcome to the job row, and the page polls. The
 * process outliving the request is what makes this work: this is a long-lived
 * Node server on Railway, not a function that is frozen the moment it
 * responds. On a platform that froze it, this would need a queue.
 *
 * Two guarantees worth keeping:
 *  - **Every job finishes in the row.** `run` catches everything and always
 *    stamps `done` or `error`, so nothing is left reading "running" forever.
 *  - **The result is not the only copy.** Generations that produce a document
 *    version still append one, exactly as before. A lost job row costs a
 *    notification, never the work.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { PmfJobKind } from "../domain/pmfJobKinds";

export { JOB_SECONDS, jobWait, type PmfJobKind } from "../domain/pmfJobKinds";

export type PmfJobStatus = "running" | "done" | "error";

export type PmfJob = {
  id: string;
  kind: PmfJobKind;
  field: string | null;
  status: PmfJobStatus;
  message: string | null;
  result: unknown;
  startedAt: string;
};

const rowToJob = (row: typeof schema.pmfJobs.$inferSelect): PmfJob => ({
  id: row.id,
  kind: row.kind as PmfJobKind,
  field: row.field,
  status: (["running", "done", "error"] as const).includes(row.status as PmfJobStatus) ? (row.status as PmfJobStatus) : "error",
  message: row.message,
  result: row.result,
  startedAt: row.createdAt.toISOString(),
});

export async function getJob(id: string, appId: string): Promise<PmfJob | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.pmfJobs)
    .where(and(eq(schema.pmfJobs.id, id), eq(schema.pmfJobs.appId, appId)))
    .limit(1);
  return row ? rowToJob(row) : null;
}

/** Anything still running for this app, so a reopened page can rejoin it. */
export async function runningJobs(appId: string): Promise<PmfJob[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.pmfJobs)
    .where(and(eq(schema.pmfJobs.appId, appId), eq(schema.pmfJobs.status, "running")))
    .orderBy(desc(schema.pmfJobs.createdAt))
    .limit(10);
  return rows.map(rowToJob);
}

/**
 * Start one, detached.
 *
 * `work` returns the message to show and, where the output is not a document
 * version, the result to keep. It is deliberately NOT awaited here: the whole
 * point is that this returns before the model does.
 */
export async function startJob(
  input: { appId: string; framework: string; field: string | null; kind: PmfJobKind },
  work: () => Promise<{ message: string; result?: unknown }>,
): Promise<string> {
  const db = await getDb();
  const [row] = await db
    .insert(schema.pmfJobs)
    .values({ appId: input.appId, framework: input.framework, field: input.field, kind: input.kind })
    .returning({ id: schema.pmfJobs.id });
  const id = row!.id;

  void (async () => {
    try {
      const { message, result } = await work();
      await finish(id, { status: "done", message, result });
    } catch (err) {
      await finish(id, { status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  })();

  return id;
}

/**
 * Stamp the outcome.
 *
 * Wrapped because this runs outside any request: an unhandled rejection here
 * would be an unhandled rejection in the server process, and on some Node
 * configurations that ends it. A job stuck on "running" is a far better
 * failure than a restart.
 */
async function finish(id: string, outcome: { status: PmfJobStatus; message: string; result?: unknown }): Promise<void> {
  try {
    const db = await getDb();
    await db
      .update(schema.pmfJobs)
      .set({ status: outcome.status, message: outcome.message, result: outcome.result ?? null, finishedAt: new Date() })
      .where(eq(schema.pmfJobs.id, id));
  } catch {
    // Nothing useful to do: the work is already done and, for everything but
    // segmentations, already saved as a document version.
  }
}
