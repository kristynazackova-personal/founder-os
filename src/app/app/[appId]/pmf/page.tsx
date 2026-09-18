/**
 * Product Market Fit - the framework, in the product.
 *
 * The content is Kristyna's own PMF framework (src/lib/domain/pmf.ts, ported
 * from her mentoring sessions). This page renders it and points at the step
 * this app is actually on, judged from its own paying-customer count and
 * whether it has any measurement yet.
 *
 * Read-only: nothing here writes, and no new tables were needed for it.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { latestAssessment } from "@/lib/services/diagnosis";
import { snippetSignals } from "@/lib/services/attribution";
import { hasLivePlans } from "@/lib/services/checkout";
import {
  PMF_NOT_YET, PMF_QUESTIONS, PMF_SOURCE, PMF_STEPS, PMF_TECHNIQUE,
  pmfStateFor, stepOf, type PmfStep,
} from "@/lib/domain/pmf";
import type { Metrics } from "@/lib/domain/metrics";
import { PageHeader } from "@/components/ui";

function StepCard({ step, current, reason }: { step: PmfStep; current: boolean; reason?: string }) {
  return (
    <section className={`card p-6 ${current ? "border-stone-900" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg text-sm font-bold ${current ? "bg-stone-900 text-white" : "border border-stone-200 text-[var(--muted)]"}`}
          >
            {step.n}
          </span>
          <div>
            <h2 className="font-semibold">{step.title}</h2>
            <p className="text-sm text-[var(--muted)]">{step.purpose}</p>
          </div>
        </div>
        {current ? <span className="badge badge-good">you are here</span> : null}
      </div>

      {current && reason ? (
        <p className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">{reason}</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-stone-700">
        {step.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {step.quotes.map((q, i) => (
          <blockquote key={i} className="border-l-2 border-stone-300 pl-4">
            <p className="text-sm leading-relaxed">&ldquo;{q.text}&rdquo;</p>
            {q.note ? <p className="mt-1 text-xs text-[var(--muted)]">{q.note}</p> : null}
          </blockquote>
        ))}
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Do this</div>
        <ul className="mt-2 flex flex-col gap-1.5">
          {step.actions.map((a, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-stone-400" />
              {a}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default async function PmfPage({ params }: { params: Promise<{ appId: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();

  const [assessment, snippet, livePlans] = await Promise.all([
    latestAssessment(app.id),
    snippetSignals(app.id),
    hasLivePlans(app.id),
  ]);
  const metrics = (assessment?.metrics ?? null) as Metrics | null;
  const state = pmfStateFor({
    payingUsers: metrics?.payingUsers ?? null,
    hasAnalytics: snippet.hasAny,
    checkoutLive: livePlans,
  });
  const current = stepOf(state.step);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Market Fit"
        subtitle="Would a client be hurt if they lost it? The framework below answers that in order, and it is sequential on purpose - the usual mistake is doing the research before the conversations."
        actions={
          <Link href={`/app/${app.id}/b2c`} className="btn btn-secondary">
            B2C analytics
          </Link>
        }
      />

      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Where you are</div>
            <div className="mt-1 text-lg font-semibold">
              {current.n}. {current.title}
            </div>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">{state.reason}</p>
          </div>
          <div className="text-right text-sm text-[var(--muted)]">
            <div>
              Paying customers: <b className="tabular-nums text-stone-900">{metrics?.payingUsers ?? "—"}</b>
            </div>
            <div>Measurement: {snippet.hasAny ? "snippet reporting" : "nothing reporting yet"}</div>
            <div>Checkout: {livePlans ? "live" : "not live"}</div>
          </div>
        </div>
        <ol className="mt-5 flex flex-wrap gap-2">
          {PMF_STEPS.map((s) => (
            <li
              key={s.key}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${s.key === state.step ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 text-[var(--muted)]"}`}
            >
              {s.n}. {s.title.split(":")[0]}
            </li>
          ))}
        </ol>
      </section>

      {PMF_STEPS.map((s) => (
        <StepCard key={s.key} step={s} current={s.key === state.step} reason={s.key === state.step ? state.reason : undefined} />
      ))}

      <section className="card p-6">
        <h2 className="font-semibold">The questions</h2>
        <p className="help">
          Her own list, kept separate by who you are asking. Read them as written - the wording is doing work.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {PMF_QUESTIONS.map((set) => (
            <div key={set.audience} className="rounded-xl border border-stone-200 p-5">
              <div className="font-semibold">{set.label}</div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{set.intro}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {set.questions.map((q, i) => (
                  <li key={i} className="text-sm">
                    &ldquo;{q}&rdquo;
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-5">
          <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">How to ask</div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {PMF_TECHNIQUE.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-stone-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">Not yet</h2>
        <p className="help">Things founders reach for early that cost more than they return at this stage.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {PMF_NOT_YET.map((n) => (
            <div key={n.rule} className="rounded-xl border border-dashed border-stone-300 p-5">
              <div className="text-sm font-semibold">{n.rule}</div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{n.because}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-[var(--muted)]">{PMF_SOURCE}</p>
    </div>
  );
}
