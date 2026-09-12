import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { buildDiagnosis, getOrRunAssessment } from "@/lib/services/diagnosis";
import { listSources } from "@/lib/services/sources";
import { bandsFor } from "@/lib/services/benchmarks";
import { STAGE_META, V1_MAX_STAGE, type Stage } from "@/lib/domain/stages";
import { formatMoney, formatPercent } from "@/lib/domain/money";
import { track } from "@/lib/track";
import { refreshDiagnosisAction } from "@/app/actions/diagnosis";
import { Alert, ConfidenceBadge, fmtDate } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { SOURCE_LABEL, type SourceType } from "@/lib/sources";

export default async function DiagnosisPage({ params }: { params: Promise<{ appId: string }> }) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();

  const sources = await listSources(app.id);
  const result = await getOrRunAssessment(app);
  const [diagnosis, bands] = await Promise.all([buildDiagnosis(app, result), bandsFor(result.placement.stage)]);
  await track("diagnosis_viewed", { userId: user.id, appId: app.id, props: { stage: diagnosis.stage, confidence: diagnosis.confidence } });
  const m = result.metrics;
  const refresh = refreshDiagnosisAction.bind(null, app.id);

  return (
    <div className="space-y-6">
      {sources.length === 0 && !result.assessment.sourcesUsed.includes("wrapped_checkout") ? (
        <Alert kind="warn">
          No payment data connected yet, so this is based on what you told us.{" "}
          <Link href={`/app/${app.id}/connect`} className="font-semibold underline">
            Connect Stripe, Lemon Squeezy or Paddle
          </Link>{" "}
          for a real placement.
        </Alert>
      ) : null}
      {result.errors.map((e) => (
        <Alert key={e.type} kind="bad">
          {SOURCE_LABEL[e.type as SourceType] ?? e.type} could not be read: {e.message}
        </Alert>
      ))}

      <section className="card p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Stage {diagnosis.stage} of {V1_MAX_STAGE}</span>
            <ConfidenceBadge confidence={diagnosis.confidence} />
          </div>
          <form action={refresh} className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span>Assessed {fmtDate(result.assessment.computedAt)}</span>
            <SubmitButton className="btn btn-secondary py-1.5 text-xs" pendingText="Reading data…">
              Refresh
            </SubmitButton>
          </form>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{diagnosis.stageName}</h1>
        <p className="text-sm text-[var(--muted)]">{STAGE_META[diagnosis.stage].short}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {diagnosis.numbers.map((k) => (
            <div key={k.label} className="rounded-xl border border-stone-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{k.label}</div>
              <div className="kpi mt-1">{k.value}</div>
              {k.hint ? <div className="help">{k.hint}</div> : null}
            </div>
          ))}
        </div>

        <p className="mt-6 text-lg leading-relaxed">{diagnosis.sentence}</p>

        <div className="mt-6 rounded-xl bg-stone-900 p-5 text-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">This week&apos;s one action</div>
          <div className="mt-1 text-lg font-semibold">{diagnosis.action.title}</div>
          <p className="mt-1 text-sm text-stone-300">{diagnosis.action.detail}</p>
          <Link href={diagnosis.action.href} className="btn mt-4 bg-white text-stone-900">
            Do it
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-semibold">Why you&apos;re here</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {diagnosis.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-semibold">Data confidence</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
            {diagnosis.confidenceReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Sources used: {(result.assessment.sourcesUsed ?? []).length ? result.assessment.sourcesUsed.join(", ") : "none"}. Rules are documented in docs/STAGES.md.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">{bands.source === "peers" ? `Apps like yours (${bands.n} on Founder OS)` : "Benchmarks for this stage"}</h2>
          <p className="help">{bands.source === "peers" ? "Median of apps at this stage with high or medium confidence." : "Public indie-SaaS benchmarks until we have 50+ apps in this stage."}</p>
          <table className="data mt-3">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Low</th>
                <th>Median</th>
                <th>High</th>
              </tr>
            </thead>
            <tbody>
              {bands.bands.map((b) => (
                <tr key={b.metric}>
                  <td>
                    {b.metric}
                    <div className="text-xs text-[var(--muted)]">{b.note}</div>
                  </td>
                  <td>{b.low || "—"}</td>
                  <td className="font-semibold">{b.median}</td>
                  <td>{b.high || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card p-6">
        <h2 className="font-semibold">All the numbers</h2>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Paying customers", String(m.payingUsers)],
            ["Free trials", String(m.trialingUsers)],
            ["MRR", formatMoney(m.mrrUsdCents)],
            ["MRR 30 days ago", formatMoney(m.mrrPrevUsdCents)],
            ["MoM growth", formatPercent(m.momGrowth)],
            ["Churn, 30d", formatPercent(m.churn30d, 1)],
            ["Revenue, 30d", formatMoney(m.revenue30dUsdCents)],
            ["Lifetime revenue", formatMoney(m.lifetimeRevenueUsdCents)],
            ["One-time buyers, 30d", String(m.oneTimeBuyers30d)],
            ["Visitors, 30d", m.visitors30d === null ? "—" : String(m.visitors30d)],
            ["Signups, 30d", m.signups30d === null ? "—" : String(m.signups30d)],
            ["Signup → paid", formatPercent(m.signupToPaid30d, 1)],
            ["Checkout → paid", formatPercent(m.checkoutConversion30d, 1)],
            ["Days since launch", m.daysSinceLaunch === null ? "—" : String(m.daysSinceLaunch)],
            ["Days of payment data", m.daysOfData === null ? "—" : String(m.daysOfData)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between rounded-lg border border-stone-100 px-3 py-2">
              <span className="text-[var(--muted)]">{k}</span>
              <span className="font-semibold tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">The ladder</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-4">
          {([0, 1, 2, 3] as Stage[]).map((s) => (
            <li key={s} className={`rounded-xl border p-4 ${s === diagnosis.stage ? "border-stone-900 bg-stone-50" : "border-stone-200"}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Stage {s}</div>
              <div className="font-semibold">{STAGE_META[s].name}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{STAGE_META[s].short}</div>
              <div className="mt-2 text-xs">{STAGE_META[s].goal}</div>
            </li>
          ))}
        </ol>
        <p className="help">Stages 4 and 5 arrive with the launch sequence and weekly playbook.</p>
      </section>
    </div>
  );
}
