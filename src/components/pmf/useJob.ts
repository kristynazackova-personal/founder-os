"use client";

/**
 * Following a generation that outlives the page.
 *
 * The action returns as soon as the job is started, so the button can no
 * longer report the outcome: this polls for it. Two consequences worth being
 * deliberate about.
 *
 * Closing the page no longer cancels anything - the work is running on the
 * server and its output is a saved version. So the waiting message says that
 * out loud, because a founder who believes a spinner is load-bearing will sit
 * and watch it for three minutes.
 *
 * And a reopened page rejoins nothing: the job id lived in the action's return
 * value, which a reload throws away. The work still lands as a new version, so
 * the cost is the notification rather than the result.
 */
import { useEffect, useState } from "react";
import { pmfJobAction, type JobState } from "@/app/actions/pmf";
import type { PmfJob } from "@/lib/services/pmfJobs";

/** Long enough not to hammer the DB, short enough to feel like it is watching. */
const POLL_MS = 4_000;
const FIRST_POLL_MS = 2_000;

export function useJob(appId: string, state: JobState): PmfJob | null {
  const jobId = state?.jobId;
  // Stored WITH the id it belongs to, rather than cleared when the id
  // changes: a second run must not show the first one's outcome, and
  // resetting state from inside the effect is the wrong way to get that.
  const [entry, setEntry] = useState<{ id: string; job: PmfJob } | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const next = await pmfJobAction(appId, jobId).catch(() => null);
      if (!live) return;
      if (next) setEntry({ id: jobId, job: next });
      // A missing job is treated as still running: the likely cause is a read
      // racing the insert, and giving up would report a failure that is not one.
      if (!next || next.status === "running") timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, FIRST_POLL_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [appId, jobId]);

  return entry && entry.id === jobId ? entry.job : null;
}
