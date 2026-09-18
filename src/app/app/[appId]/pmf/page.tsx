/**
 * Product Market Fit - the frameworks, in the product.
 *
 * Two of them (domain/pmfFrameworks.ts), switched by `?framework=`:
 *
 *  - `conversation`, from Kristyna's mentoring sessions: for a business that
 *    already has customers. It also reports which stage this app is on,
 *    judged from its own numbers (`pmfStateFor`).
 *  - `build`, from her written Product Framework doc: for something being
 *    built or scoped, and the tool is not allowed to answer it for you.
 *
 * Each framework has its own document and its own version history.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppForUser } from "@/lib/services/apps";
import { latestAssessment } from "@/lib/services/diagnosis";
import { snippetSignals } from "@/lib/services/attribution";
import { hasLivePlans } from "@/lib/services/checkout";
import { pmfStateFor, stepOf } from "@/lib/domain/pmf";
import { PMF_FRAMEWORKS, asFrameworkId, frameworkOf, type PmfFramework, type PmfStage } from "@/lib/domain/pmfFrameworks";
import { completion, incompleteStages, type PmfDoc } from "@/lib/domain/pmfDoc";
import { latestDoc, listDocs } from "@/lib/services/pmfDocs";
import { aiConfigured } from "@/lib/services/ai";
import type { Metrics } from "@/lib/domain/metrics";
import { PageHeader } from "@/components/ui";
import { GenerateButton, RewriteBox, StageAnswers, VersionList } from "@/components/pmf/PmfEditor";

function StageCard({
  appId,
  framework,
  stage,
  current,
  reason,
  doc,
}: {
  appId: string;
  framework: PmfFramework;
  stage: PmfStage;
  current: boolean;
  reason?: string;
  doc: PmfDoc | null;
}) {
  return (
    <section className={`card p-5 sm:p-6 ${current ? "border-stone-900" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg text-sm font-bold ${current ? "bg-stone-900 text-white" : "border border-stone-200 text-[var(--muted)]"}`}
          >
            {stage.n}
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold">{stage.title}</h2>
            <p className="text-sm text-[var(--muted)]">{stage.purpose}</p>
          </div>
        </div>
        {current ? <span className="badge badge-good flex-none">you are here</span> : null}
      </div>

      {current && reason ? <p className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">{reason}</p> : null}

      <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-stone-700">
        {stage.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {stage.quotes.map((q, i) => (
          <blockquote key={i} className="border-l-2 border-stone-300 pl-4">
            <p className="text-sm leading-relaxed">&ldquo;{q.text}&rdquo;</p>
            {q.note ? <p className="mt-1 text-xs text-[var(--muted)]">{q.note}</p> : null}
          </blockquote>
        ))}
      </div>

      <StageAnswers appId={appId} framework={framework.id} stage={stage.key} doc={doc} />

      <div className="mt-5">
        <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Do this</div>
        <ul className="mt-2 flex flex-col gap-1.5">
          {stage.actions.map((a, i) => (
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

export default async function PmfPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const { appId } = await params;
  const app = await getAppForUser(appId, user.id);
  if (!app) notFound();

  const raw = (await searchParams).framework;
  const framework = frameworkOf(asFrameworkId(Array.isArray(raw) ? raw[0] : raw));

  const [assessment, snippet, livePlans, doc, versions] = await Promise.all([
    latestAssessment(app.id),
    snippetSignals(app.id),
    hasLivePlans(app.id),
    latestDoc(app.id, framework.id),
    listDocs(app.id, framework.id),
  ]);
  const metrics = (assessment?.metrics ?? null) as Metrics | null;

  // "You are here" is only meaningful for the conversation framework, whose
  // stages map onto how much of a business exists. The build framework runs
  // before any of those numbers exist.
  const state =
    framework.id === "conversation"
      ? pmfStateFor({ payingUsers: metrics?.payingUsers ?? null, hasAnalytics: snippet.hasAny, checkoutLive: livePlans })
      : null;
  const currentStage = state ? stepOf(state.step).key : incompleteStages(framework, doc)[0] ?? framework.stages[0].key;
  const open = incompleteStages(framework, doc);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Market Fit"
        subtitle={framework.tagline}
        actions={
          <Link href={`/app/${app.id}/b2c`} className="btn btn-secondary">
            B2C analytics
          </Link>
        }
      />

      <nav className="tab-strip gap-1.5" aria-label="Frameworks">
        {Object.values(PMF_FRAMEWORKS).map((f) => (
          <Link
            key={f.id}
            href={`/app/${app.id}/pmf${f.id === "conversation" ? "" : `?framework=${f.id}`}`}
            aria-current={f.id === framework.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${f.id === framework.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-[var(--muted)] hover:text-stone-900"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <section className="card p-5 sm:p-6">
        <h2 className="font-semibold">{framework.title}</h2>
        <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-stone-700">
          {framework.intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="mt-4">
          <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            {framework.rules.length > 1 ? "The rules" : "The rule"}
          </div>
          <ol className="mt-2 flex flex-col gap-2">
            {framework.rules.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="flex-none font-semibold text-[var(--muted)]">{i + 1}.</span>
                {r}
              </li>
            ))}
          </ol>
        </div>
        {state ? (
          <div className="mt-5 flex flex-wrap items-start justify-between gap-4 border-t border-stone-200 pt-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Where you are</div>
              <div className="mt-1 font-semibold">
                {stepOf(state.step).n}. {stepOf(state.step).title}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">{state.reason}</p>
            </div>
            <div className="text-sm text-[var(--muted)]">
              <div>
                Paying customers: <b className="tabular-nums text-stone-900">{metrics?.payingUsers ?? "—"}</b>
              </div>
              <div>Measurement: {snippet.hasAny ? "snippet reporting" : "nothing reporting yet"}</div>
              <div>Checkout: {livePlans ? "live" : "not live"}</div>
            </div>
          </div>
        ) : null}
      </section>

      {doc === null ? (
        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Start it for {app.name}</h2>
          <p className="help">
            A business created from now on gets both frameworks prepared the moment it is created. {app.name} predates
            that, so it starts on demand.{" "}
            {framework.aiRole === "pressure_test"
              ? "This one will not answer for you - it writes the sharpest version of each question for this business, because the framework's own rule is that the ideas are yours."
              : "Anything the tool cannot know is left as a question aimed at you rather than a guess."}
          </p>
          <div className="mt-4">
            <GenerateButton appId={app.id} framework={framework.id} label={framework.aiRole === "pressure_test" ? "Prepare the questions" : "Fill in the framework"} />
          </div>
        </section>
      ) : (
        <section className="card flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-semibold">Your answers</h2>
              <p className="help">
                Version {doc.version} · {Math.round(completion(framework, doc) * 100)}% answered
                {open.length ? ` · still open at stage ${framework.stages.find((s) => s.key === open[0])?.n}` : " · complete"}
              </p>
            </div>
            <GenerateButton appId={app.id} framework={framework.id} label={framework.aiRole === "pressure_test" ? "Sharpen the open questions" : "Fill in the gaps again"} />
          </div>
          <RewriteBox appId={app.id} framework={framework.id} canRewrite={aiConfigured()} pressureTest={framework.aiRole === "pressure_test"} />
        </section>
      )}

      {framework.stages.map((s) => (
        <StageCard
          key={s.key}
          appId={app.id}
          framework={framework}
          stage={s}
          current={s.key === currentStage}
          reason={state && s.key === currentStage ? state.reason : undefined}
          doc={doc}
        />
      ))}

      {versions.length > 1 ? (
        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Versions</h2>
          <p className="help">Every edit and every rewrite appends. Nothing overwrites, so the first draft is still here.</p>
          <div className="mt-3">
            <VersionList docs={versions} />
          </div>
        </section>
      ) : null}

      <p className="text-xs text-[var(--muted)]">{framework.source}</p>
    </div>
  );
}
