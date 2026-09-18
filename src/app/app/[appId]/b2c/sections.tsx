/**
 * The five B2C analytics views. Each one is a server component: it takes the
 * already-loaded page payload and renders it, so the shape the service
 * returns is the only contract between them.
 */
import Link from "next/link";
import type { AcquisitionPage, ActivationPage, CoveragePage, LoopsPage, OverviewPage, RevenuePage } from "@/lib/services/b2cAnalytics";
import { Bullets, CohortGrid, DataTable, FunnelRows, GatesCard, Legend, LockedBanner, Notes, Section, SERIES, TileGrid, WeeklyBars } from "@/components/b2c/tiles";

const PLATFORM_LEGEND = [
  { color: SERIES.web, label: "Web" },
  { color: SERIES.app, label: "App" },
];

export function OverviewView({ data }: { data: OverviewPage }) {
  return (
    <>
      <TileGrid tiles={data.tiles} />
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title="Week by week" sub={`${data.byWeek.label} · counts stay next to every rate, and a rate is withheld under 30`}>
          <DataTable
            head={["Metric", ...data.window.weeks.slice(-8).map((w) => w.label)]}
            rows={data.byWeek.rows.map((r) => [r.label, ...r.values])}
          />
        </Section>
        <div className="flex flex-col gap-3.5">
          <Section title="What changed" sub="the deltas worth reading, worst first">
            <Bullets items={data.changes} />
          </Section>
          <Section title="How to read this">
            <Bullets
              items={[
                { verdict: "none", text: "Cohorts are ISO weeks by signup date. A retention cell appears only once its window has fully elapsed." },
                { verdict: "none", text: "A rate needs a denominator of 30. Below that you get the count pair - “3 of 11” - because a percentage of eleven people is noise." },
                { verdict: "none", text: "“—” means no connected source can answer it. It never means zero. The Coverage tab lists every one and what would fix it." },
                { verdict: "none", text: "Gates come from published benchmarks for your category, refined from comparable products. Every one names its source." },
                { verdict: "none", text: <>This sits alongside <b>Diagnosis</b> and <b>Attribution</b>, which are unchanged.</> },
              ]}
            />
          </Section>
        </div>
      </div>
      <GatesCard gates={data.gates} />
    </>
  );
}

export function AcquisitionView({ data }: { data: AcquisitionPage }) {
  return (
    <>
      <TileGrid tiles={data.tiles} />
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section title="Signups per week" sub="stacked - web below, app above; the last bar carries its total">
          <WeeklyBars rows={data.signupsPerWeek} />
          <Legend items={PLATFORM_LEGEND} />
        </Section>
        <Section title="By channel" sub="activated = reached the activation event within a day of signing up">
          <DataTable
            head={["Channel", "Web", "App", "Signups", "Activated", "Paid"]}
            rows={data.channels.map((c) => [c.label, c.web, c.app, c.signups, c.activated, c.purchased])}
          />
        </Section>
      </div>
      <Section title="The snippet funnel" sub="distinct visitors per step, from first touch in this window">
        <FunnelRows steps={data.funnel} />
      </Section>
      <Notes notes={data.notes} />
    </>
  );
}

export function ActivationView({ data }: { data: ActivationPage }) {
  return (
    <>
      <TileGrid tiles={data.tiles} />
      <Section title="Cohort triangle" sub="share of each signup week active in week N · one hue, darker = more · a cell is blank until its week has elapsed">
        <CohortGrid rows={data.triangle} />
      </Section>
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <Section title="Active visitors per week" sub="anyone who fired any event that week, not only new signups">
          <DataTable head={["Week", "Active"]} rows={data.activeUsersPerWeek.map((w) => [w.label, w.users])} />
        </Section>
        <Section title="Time to first value" sub="signup → the first activation or purchase">
          <DataTable
            head={["Measure", "Value"]}
            rows={[
              ["Median", data.timeToValue.medianMinutes === null ? "—" : `${Math.round(data.timeToValue.medianMinutes)} min`],
              ["p75", data.timeToValue.p75Minutes === null ? "—" : `${Math.round(data.timeToValue.p75Minutes)} min`],
              ["Visitors measured", data.timeToValue.measured],
            ]}
          />
          <p className="text-xs text-[var(--muted)]">
            Only visitors who activated appear here - it is the shape of a success, not a conversion rate.
          </p>
        </Section>
      </div>
      <Notes notes={data.notes} />
    </>
  );
}

export function RevenueView({ data }: { data: RevenuePage }) {
  return (
    <>
      <TileGrid tiles={data.tiles} />
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Section title="Monetization funnel" sub="per platform · a step no source reports reads n/a, never 0">
          <FunnelRows steps={data.funnel} />
        </Section>
        <div className="flex flex-col gap-3.5">
          <Section title="By rail" sub="subscriptions as each connected source reports them">
            <DataTable head={["Rail", "Active", "Trialing"]} rows={data.byRail.map((r) => [r.rail === "wrapped" ? "Wrapped checkout" : "Connected rail", r.active, r.trialing])} />
          </Section>
          <Section title="Paid by signup cohort" sub="purchases traced back to the week the buyer signed up">
            <DataTable head={["Signup week", "Signups", "Purchased"]} rows={data.cohortPaid.map((c) => [c.label, c.signups, c.purchased])} />
          </Section>
        </div>
      </div>
      <Notes notes={data.notes} />
    </>
  );
}

const STATE_LABEL = { live: "live", partial: "partial", missing: "no source" } as const;
const STATE_CLASS = {
  live: "text-[#047857] bg-[#ecfdf5] border-[#a7f3d0]",
  partial: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  missing: "text-stone-600 bg-stone-100 border-stone-200",
} as const;

export function CoverageView({ data, appId }: { data: CoveragePage; appId: string }) {
  return (
    <>
      <TileGrid tiles={data.tiles} />
      <Section title="What can be measured, and what cannot" sub="every “—” on the other tabs is one of these rows">
        <DataTable
          numericFrom={9}
          head={["Metric", "State", "Why", "What would fix it"]}
          rows={data.rows.map((r) => [
            r.metric,
            <span key="s" className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATE_CLASS[r.state]}`}>{STATE_LABEL[r.state]}</span>,
            <span key="w" className="text-xs text-[var(--muted)]">{r.why}</span>,
            <span key="f" className="text-xs">{r.fix}</span>,
          ])}
        />
      </Section>
      <Section title="Where to go next">
        <Bullets
          items={[
            { verdict: "none", text: <>Snippet and events: <Link href={`/app/${appId}/attribution`} className="underline">Attribution</Link>.</> },
            { verdict: "none", text: <>Payment rails and analytics sources: <Link href={`/app/${appId}/settings`} className="underline">Settings → Connect your Platforms</Link>.</> },
            { verdict: "none", text: <>Push and lifecycle email: the <b>Loops</b> tab is laid out and locked until a provider is connected. Nothing on it is estimated in the meantime.</> },
          ]}
        />
      </Section>
      <GatesCard gates={data.gates} />
      <Notes notes={data.notes} />
    </>
  );
}


export function LoopsView({ data, appId }: { data: LoopsPage; appId: string }) {
  return (
    <>
      <LockedBanner title="Locked until a push or email provider is connected">
        Push and lifecycle email are the day-two engine, and Founder OS cannot see a single send of either - they
        happen in your tooling, not ours. The layout below is what the page will show; every figure reads
        &ldquo;—&rdquo; until a provider can be read, and nothing here is estimated in the meantime.{" "}
        <Link href={`/app/${appId}/settings`} className="underline">Add a push or email provider</Link>.
      </LockedBanner>
      <TileGrid tiles={data.tiles} />
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section title="By trigger" sub="one row per send · returned = active within 48 hours of it">
          <DataTable
            head={["Trigger", "Sent", "Opened", "Returned"]}
            rows={data.rows.map((r) => [r.trigger, r.sent, r.opened, r.returned])}
          />
        </Section>
        <Section title="By surface" sub="where the nudge was shown">
          <DataTable
            head={["Surface", "Shown", "Tapped", "Returned"]}
            rows={data.nextStepRows.map((r) => [r.trigger, r.sent, r.opened, r.returned])}
          />
        </Section>
      </div>
      <Notes notes={data.notes} />
    </>
  );
}

/** Shared by every view's header: the window the numbers cover. */
export function WindowLine({ from, to, generatedAt, snippetInstalled }: { from: string; to: string; generatedAt: string; snippetInstalled: boolean }) {
  return (
    <p className="text-xs text-[var(--muted)]">
      {from && to ? `${from} → ${to}` : "no complete weeks yet"} · generated {new Date(generatedAt).toISOString().slice(11, 16)} UTC
      {snippetInstalled ? "" : " · the snippet has never reported an event"}
    </p>
  );
}
