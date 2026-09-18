/**
 * B2C analytics presentation primitives — the metric tile and the small
 * charts and tables the pages are built from.
 *
 * The tile anatomy is the contract (docs/B2C_ANALYTICS.md): label, source
 * badges, value, n line, target line, verdict chip, delta, sparkline, caveat.
 * A verdict is always an icon plus a label, never colour alone, and a rate
 * never appears without the count that produced it — the service decides
 * that, these components only render what it gives them.
 *
 * Server components by default: nothing here needs state.
 */
import type { ReactNode } from "react";
import type { FunnelStep, Tile, TriangleRow, Verdict } from "@/lib/domain/b2c";
import { GATE_HIGHER_IS_BETTER, GATE_METRIC_LABEL, INDUSTRY_LABEL, NATURE_LABEL, type GateSet } from "@/lib/domain/gates";
import type { MeasurementNote } from "@/lib/domain/notes";
import { funnelShares } from "@/lib/domain/b2c";

/** Web is blue, app is orange, the ink accent marks totals and the current point. */
export const SERIES = { web: "#2a78d6", app: "#eb6834", accent: "#111827", muted: "#d6d3d1" } as const;
/** One hue, light → dark, for cohort cells. Never a rainbow. */
const SEQ = ["#f0f7ff", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];

const VERDICT_CLASS: Record<Verdict, string> = {
  good: "text-[#047857] bg-[#ecfdf5] border-[#a7f3d0]",
  warn: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  crit: "text-[#b91c1c] bg-[#fef2f2] border-[#fecaca]",
  none: "text-stone-600 bg-stone-100 border-stone-200",
};

function VerdictIcon({ verdict }: { verdict: Verdict }) {
  const common = { width: 11, height: 11, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (verdict === "good") return <svg {...common}><path d="M2 6.5l2.5 2.5L10 3.5" /></svg>;
  if (verdict === "warn") return <svg {...common} strokeWidth={1.8}><path d="M6 1.5l5 9H1z" /><path d="M6 5v2.5M6 9.2v.1" /></svg>;
  if (verdict === "crit") return <svg {...common}><path d="M3 3l6 6M9 3l-6 6" /></svg>;
  return <svg {...common}><path d="M3 6h6" /></svg>;
}

export function VerdictChip({ verdict, children }: { verdict: Verdict; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${VERDICT_CLASS[verdict]}`}>
      <VerdictIcon verdict={verdict} />
      {children}
    </span>
  );
}

export function Caveat({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] text-[#b45309]">
      <span className="mt-0.5 flex-none"><VerdictIcon verdict="warn" /></span>
      <span>{children}</span>
    </div>
  );
}

function SourceBadges({ sources }: { sources: string[] }) {
  return (
    <span className="flex flex-none gap-1">
      {sources.map((s) => (
        <span key={s} className="rounded border border-stone-200 px-1 text-[10px] font-semibold tracking-wide text-[var(--muted)] whitespace-nowrap">{s}</span>
      ))}
    </span>
  );
}

/** Muted line over the loaded weeks, the current week as the only accent mark. No axis. */
export function Sparkline({ values, width = 100, height = 26 }: { values: (number | null)[]; width?: number; height?: number }) {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const mx = Math.max(...nums);
  const mn = Math.min(...nums);
  const rng = mx - mn || 1;
  const n = values.length;
  const pts = values.map((v, i) => (v === null ? null : ([2 + (i * (width - 4)) / Math.max(1, n - 1), height - 3 - ((v - mn) / rng) * (height - 6)] as const)));
  let d = "";
  let pen = false;
  for (const p of pts) {
    if (!p) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
    pen = true;
  }
  const last = [...pts].reverse().find((p) => p);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={SERIES.muted} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={3.5} fill={SERIES.accent} stroke="#fff" strokeWidth={2} />}
    </svg>
  );
}

const DELTA_CLASS = { up: "text-[#047857]", down: "text-[#b91c1c]", flat: "text-[var(--muted)]" } as const;

export function MetricTile({ tile }: { tile: Tile }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2 text-xs font-semibold text-[var(--muted)]">
        <span>{tile.label}</span>
        <SourceBadges sources={tile.sources} />
      </div>
      <div className={`leading-none font-bold tracking-tight tabular-nums ${tile.value === "—" ? "text-xl text-[var(--muted)]" : "text-[30px]"}`}>
        {tile.value}
        {tile.small ? <span className="ml-1 text-sm font-semibold text-[var(--muted)]">{tile.small}</span> : null}
      </div>
      <div className="text-xs text-[var(--muted)]">{tile.n}</div>
      {tile.target ? <div className="text-xs text-[var(--muted)]">{tile.target}</div> : null}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <VerdictChip verdict={tile.verdict}>{tile.verdictLabel}</VerdictChip>
        {tile.delta ? <span className={`text-xs font-semibold whitespace-nowrap ${DELTA_CLASS[tile.delta.dir]}`}>{tile.delta.text}</span> : null}
        {tile.series ? <span className="ml-auto"><Sparkline values={tile.series} /></span> : null}
      </div>
      {tile.caveat ? <Caveat>{tile.caveat}</Caveat> : null}
    </div>
  );
}

export function TileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => <MetricTile key={t.key} tile={t} />)}
    </div>
  );
}

export function Section({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {sub ? <p className="text-xs text-[var(--muted)]">{sub}</p> : null}
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 text-xs text-[var(--muted)]">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{i.label}
        </span>
      ))}
    </div>
  );
}

export function DataTable({ head, rows, numericFrom = 1 }: { head: ReactNode[]; rows: ReactNode[][]; numericFrom?: number }) {
  if (rows.length === 0) return <p className="py-3 text-sm text-[var(--muted)]">Nothing in this window.</p>;
  return (
    <div className="scroll-x">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className={`border-b border-stone-200 px-2 py-1.5 text-[11px] font-semibold tracking-wide whitespace-nowrap text-[var(--muted)] uppercase ${i >= numericFrom ? "text-right" : "text-left"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`border-b border-stone-100 px-2 py-2 tabular-nums ${ci >= numericFrom ? "text-right whitespace-nowrap" : "text-left"} ${ci === 0 ? "font-medium" : ""}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Stacked weekly bars: web below, app above, the last bar labelled with its total. */
export function WeeklyBars({ rows, width = 640, height = 190 }: { rows: { label: string; web: number; app: number }[]; width?: number; height?: number }) {
  if (rows.length === 0) return <p className="py-4 text-sm text-[var(--muted)]">No signups in this window.</p>;
  const rawMax = Math.max(4, ...rows.map((r) => r.web + r.app)) * 1.2;
  const step = rawMax > 100 ? 50 : rawMax > 40 ? 20 : rawMax > 20 ? 10 : rawMax > 8 ? 4 : 2;
  const ymax = Math.ceil(rawMax / step) * step;
  const padL = 30;
  const padB = 22;
  const top = 14;
  const bw = (width - padL - 10) / rows.length;
  const barw = Math.min(28, bw * 0.55);
  const plotH = height - padB - top;
  const base = height - padB;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Signups per week, web and app">
      {[0, 1, 2, 3, 4].map((g) => {
        const y = top + plotH * (1 - g / 4);
        return (
          <g key={g}>
            <line x1={padL} x2={width - 4} y1={y} y2={y} stroke="#f5f5f4" />
            <text x={padL - 6} y={y + 4} fontSize={10} fill="#6b7280" textAnchor="end">{Math.round((ymax * g) / 4)}</text>
          </g>
        );
      })}
      {rows.map((r, i) => {
        const x = padL + i * bw + (bw - barw) / 2;
        const hw = (plotH * r.web) / ymax;
        const ha = (plotH * r.app) / ymax;
        const total = r.web + r.app;
        const isLast = i === rows.length - 1;
        return (
          <g key={r.label}>
            <rect x={x} y={base - hw} width={barw} height={hw} fill={SERIES.web} />
            <rect x={x} y={base - hw - ha - (ha && hw ? 2 : 0)} width={barw} height={ha} fill={SERIES.app} rx={3} />
            <text x={x + barw / 2} y={height - 6} fontSize={10} fill="#6b7280" textAnchor="middle">{r.label}</text>
            {isLast && total > 0 ? <text x={x + barw / 2} y={Math.max(10, base - hw - ha - 8)} fontSize={11} fontWeight={700} textAnchor="middle">{total}</text> : null}
          </g>
        );
      })}
      <line x1={padL} x2={width - 4} y1={base} y2={base} stroke="#d6d3d1" />
    </svg>
  );
}

/** The funnel: one row per step, a bar per platform, each step's share of the step above. */
export function FunnelRows({ steps }: { steps: FunnelStep[] }) {
  const shares = funnelShares(steps);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="hidden grid-cols-[minmax(120px,1.4fr)_minmax(0,2fr)_60px_60px_56px] items-center gap-2 text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase sm:grid">
        <span>Step</span><span>Share of the top</span><span className="text-right">Web</span><span className="text-right">App</span><span className="text-right">% prev</span>
      </div>
      {shares.map(({ step, webShare, appShare, prevPct }) => (
        <div
          key={step.key}
          className="grid grid-cols-[minmax(0,1fr)_56px_56px_52px] items-center gap-2 border-b border-stone-100 pb-2 text-sm last:border-0 sm:grid-cols-[minmax(120px,1.4fr)_minmax(0,2fr)_60px_60px_56px] sm:border-0 sm:pb-0"
        >
          <span className="col-span-full min-w-0 sm:col-span-1">
            {step.label}
            {step.caveat ? <span className="block text-[11px] text-[#b45309]">{step.caveat}</span> : null}
          </span>
          <span className="col-span-full flex flex-col gap-0.5 sm:col-span-1">
            <span className="relative h-3 overflow-hidden rounded-r bg-stone-100">
              {webShare !== null ? <i className="absolute inset-y-0 left-0 rounded-r" style={{ width: `${Math.max(1, webShare * 100)}%`, background: SERIES.web }} /> : null}
            </span>
            <span className="relative h-3 overflow-hidden rounded-r bg-stone-100">
              {appShare !== null ? <i className="absolute inset-y-0 left-0 rounded-r" style={{ width: `${Math.max(1, appShare * 100)}%`, background: SERIES.app }} /> : null}
            </span>
          </span>
          <span className="text-right tabular-nums">
            <span className="mr-1 text-[10px] text-[var(--muted)] uppercase sm:hidden">web</span>
            {step.web === null ? "n/a" : step.web}
          </span>
          <span className="text-right tabular-nums">
            <span className="mr-1 text-[10px] text-[var(--muted)] uppercase sm:hidden">app</span>
            {step.app === null ? "n/a" : step.app}
          </span>
          <span className="text-right text-xs tabular-nums text-[var(--muted)]">{prevPct}</span>
        </div>
      ))}
    </div>
  );
}

/** Cohort triangle: share of each signup week active in week N. A null cell is blank, never 0. */
export function CohortGrid({ rows }: { rows: TriangleRow[] }) {
  const width = Math.max(...rows.map((r) => r.cells.length), 1);
  const shade = (v: number | null) => (v === null ? "transparent" : SEQ[Math.min(SEQ.length - 1, Math.floor((v / 0.35) * (SEQ.length - 1)))]);
  return (
    <div className="scroll-x">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">Signup week</th>
            <th className="px-2 py-1.5 text-right text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">n</th>
            {Array.from({ length: width }, (_, i) => (
              <th key={i} className="px-2 py-1.5 text-right text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">W{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="px-2 py-1.5 font-medium whitespace-nowrap">{r.label}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[var(--muted)]">{r.n}</td>
              {Array.from({ length: width }, (_, i) => {
                const v = r.cells[i] ?? null;
                return (
                  <td key={i} className="px-2 py-1.5 text-right tabular-nums" style={{ background: shade(v), color: v !== null && v > 0.22 ? "#fff" : undefined }}>
                    {v === null ? <span className="text-[var(--muted)]">·</span> : `${Math.round(v * 100)}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SourceErrors({ errors }: { errors: Record<string, string> }) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4">
      <div className="text-sm font-semibold text-[#b45309]">Some sources could not be read</div>
      <ul className="mt-2 flex flex-col gap-1 text-xs text-[#b45309]">
        {entries.map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}
      </ul>
      <p className="mt-2 text-xs text-[var(--muted)]">Tiles that depend on them read &ldquo;—&rdquo;. Nothing else on the page is affected.</p>
    </div>
  );
}

export function Bullets({ items }: { items: { verdict: Verdict; text: ReactNode }[] }) {
  const DOT: Record<Verdict, string> = { good: "#047857", warn: "#b45309", crit: "#b91c1c", none: "#6b7280" };
  if (items.length === 0) return <p className="py-2 text-sm text-[var(--muted)]">Nothing moved enough to call out.</p>;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {items.map((i, n) => (
        <div key={n} className="flex items-start gap-2.5">
          <span className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ background: DOT[i.verdict] }} />
          <span>{i.text}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A measurement note: something the reader has to know to read a number
 * correctly, printed next to the number rather than left in a doc.
 */
export function Notes({ notes }: { notes: MeasurementNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {notes.map((n) => (
        <div key={n.key} className="flex gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <span className="mt-0.5 flex-none text-[var(--muted)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">{n.title}</div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{n.body}</p>
            {n.action ? <p className="mt-1.5 text-xs">{n.action}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A page whose numbers cannot exist yet: the layout is real, the figures are not filled in. */
export function LockedBanner({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-300 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex-none text-[var(--muted)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--muted)]">{children}</p>
        </div>
      </div>
    </div>
  );
}

/** The thresholds this app is judged against, and where each one came from. */
export function GatesCard({ gates }: { gates: GateSet }) {
  const asPct = (f: number) => `${(f * 100).toFixed(f < 0.1 ? 1 : 0)}%`;
  return (
    <Section
      title="What these numbers are judged against"
      sub={
        gates.origin === "category"
          ? `Published benchmarks for ${INDUSTRY_LABEL[gates.profile.industry].toLowerCase()} sold as ${NATURE_LABEL[gates.profile.nature].toLowerCase()}. Set when the app was created.`
          : `Refined from comparable products${gates.competitors.length ? ` — ${gates.competitors.join("; ")}` : ""}.`
      }
    >
      <DataTable
        numericFrom={1}
        head={["Metric", "Gate", "Category band", "Where it comes from"]}
        rows={gates.gates.map((g) => [
          GATE_METRIC_LABEL[g.metric],
          `${GATE_HIGHER_IS_BETTER[g.metric] ? "≥" : "≤"} ${asPct(g.target)}`,
          g.band ? `${asPct(g.band.low)}–${asPct(g.band.high)}` : "—",
          <span key="s" className="text-xs text-[var(--muted)]">{g.source}{g.origin === "researched" ? " · competitor pass" : ""}</span>,
        ])}
      />
      {gates.notes.length ? (
        <ul className="mt-1 flex flex-col gap-1 text-xs text-[var(--muted)]">
          {gates.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      ) : null}
    </Section>
  );
}
