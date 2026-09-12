"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CopyButton } from "./CopyButton";
import { pricingPageHtml, pricingPagePrompt, recommendPricing, type Audience, type Frequency, type PricingAnswers, type PricingRecommendation, type Replaces, type Tier, type ValueMetric } from "@/lib/domain/pricing";

export type TierOverrides = Record<string, { name?: string; priceCents?: number; yearlyPriceCents?: number | null }>;

const DEFAULT: PricingAnswers = {
  audience: "prosumer",
  replaces: "manual_work",
  replacesCostMonthly: null,
  valueMetric: "flat",
  frequency: "weekly",
  comparables: "",
  comparablePriceMonthly: null,
  wtpTooCheap: null,
  wtpTooExpensive: null,
  activationEvent: "",
  costToServeMonthly: null,
};

type Props = {
  mode: "standalone" | "app";
  appName?: string;
  initialAnswers?: PricingAnswers | null;
  initialRecommendation?: PricingRecommendation | null;
  initialOverrides?: TierOverrides;
  checkoutUrls?: Record<string, string>;
  checkoutHref?: string;
  onSave?: (answers: PricingAnswers) => Promise<PricingRecommendation>;
  onOverrides?: (overrides: TierOverrides) => Promise<void>;
  onCopied?: () => Promise<void>;
};

function num(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
}
const usd = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);

function Q({ n, title, help, children }: { n: number; title: string; help: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-stone-200 py-5 first:border-t-0">
      <div className="flex gap-3">
        <div className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-stone-900 text-center text-xs font-bold leading-6 text-white">{n}</div>
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <div className="help mb-3">{help}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function PricingInterview(p: Props) {
  const [answers, setAnswers] = useState<PricingAnswers>(p.initialAnswers ?? DEFAULT);
  const [rec, setRec] = useState<PricingRecommendation | null>(p.initialRecommendation ?? null);
  const [overrides, setOverrides] = useState<TierOverrides>(p.initialOverrides ?? {});
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  // Standalone: remember the last run locally so a refresh doesn't lose it.
  useEffect(() => {
    if (p.mode !== "standalone" || p.initialAnswers) return;
    // Deferred so the restore happens after hydration, not during it.
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem("fos_pricing");
        if (raw) {
          const parsed = JSON.parse(raw) as { answers: PricingAnswers; rec: PricingRecommendation };
          setAnswers(parsed.answers);
          setRec(parsed.rec);
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [p.mode, p.initialAnswers]);

  const set = <K extends keyof PricingAnswers>(k: K, v: PricingAnswers[K]) => setAnswers((a) => ({ ...a, [k]: v }));

  const tiers: Tier[] = useMemo(() => {
    if (!rec) return [];
    return rec.tiers.map((t) => {
      const o = overrides[t.key];
      return o ? { ...t, name: o.name ?? t.name, priceCents: o.priceCents ?? t.priceCents, yearlyPriceCents: o.yearlyPriceCents === undefined ? t.yearlyPriceCents : o.yearlyPriceCents } : t;
    });
  }, [rec, overrides]);
  const effective = rec ? { ...rec, tiers } : null;
  const html = effective ? pricingPageHtml(effective, { checkoutUrls: p.checkoutUrls, appName: p.appName }) : "";
  const prompt = effective ? pricingPagePrompt(effective, { checkoutUrls: p.checkoutUrls }) : "";

  function run() {
    if (!answers.activationEvent.trim()) {
      setSaved("Tell us the activation event — it's what the snippet will track.");
      return;
    }
    setSaved(null);
    if (p.mode === "app" && p.onSave) {
      start(async () => {
        const r = await p.onSave!(answers);
        setRec(r);
        setOverrides({});
        setSaved("Saved. Every number below can be edited.");
      });
    } else {
      const r = recommendPricing(answers);
      setRec(r);
      setOverrides({});
      try {
        localStorage.setItem("fos_pricing", JSON.stringify({ answers, rec: r }));
      } catch {
        /* ignore */
      }
    }
  }

  function edit(key: string, patch: TierOverrides[string]) {
    const next = { ...overrides, [key]: { ...(overrides[key] ?? {}), ...patch } };
    setOverrides(next);
    if (p.mode === "app" && p.onOverrides) start(() => p.onOverrides!(next));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="card p-6">
        <Q n={1} title="Who is it for?" help="The buyer, not the user, if they differ.">
          <select className="select" value={answers.audience} onChange={(e) => set("audience", e.target.value as Audience)}>
            <option value="consumer">Consumers (personal use)</option>
            <option value="prosumer">Prosumers, creators, freelancers</option>
            <option value="developer">Developers</option>
            <option value="smb">Small businesses</option>
            <option value="b2b_team">Teams inside companies</option>
          </select>
        </Q>
        <Q n={2} title="What does it replace?" help="Pricing anchors to the cost of the thing you replace.">
          <select className="select" value={answers.replaces} onChange={(e) => set("replaces", e.target.value as Replaces)}>
            <option value="manual_work">Manual work they do today</option>
            <option value="spreadsheet">A spreadsheet or notes</option>
            <option value="human_service">A person or service they pay</option>
            <option value="another_tool">Another tool they pay for</option>
            <option value="nothing">Nothing — it&apos;s a new behaviour</option>
          </select>
          <div className="mt-3">
            <label className="label">What does that cost them per month, roughly (USD)?</label>
            <input className="input" type="number" min={0} placeholder="e.g. 200" value={answers.replacesCostMonthly ?? ""} onChange={(e) => set("replacesCostMonthly", num(e.target.value))} />
          </div>
        </Q>
        <Q n={3} title="What grows when they get more value?" help="This becomes the unit you charge by.">
          <select className="select" value={answers.valueMetric} onChange={(e) => set("valueMetric", e.target.value as ValueMetric)}>
            <option value="flat">Nothing in particular — flat price</option>
            <option value="seat">Seats / users</option>
            <option value="usage">Usage (runs, messages, minutes…)</option>
            <option value="project">Projects / workspaces</option>
          </select>
        </Q>
        <Q n={4} title="How often do they use it?" help="Daily habits sustain subscriptions; one-off jobs don't.">
          <select className="select" value={answers.frequency} onChange={(e) => set("frequency", e.target.value as Frequency)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="once">Once or rarely</option>
          </select>
        </Q>
        <Q n={5} title="What do they compare you with?" help="Name one tool and what it charges per month.">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" placeholder="e.g. Calendly" value={answers.comparables} onChange={(e) => set("comparables", e.target.value)} />
            <input className="input" type="number" min={0} placeholder="$ / month" value={answers.comparablePriceMonthly ?? ""} onChange={(e) => set("comparablePriceMonthly", num(e.target.value))} />
          </div>
        </Q>
        <Q n={6} title="Willingness to pay" help="Monthly price at which it would feel suspiciously cheap — and too expensive to consider.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Too cheap ($/mo)</label>
              <input className="input" type="number" min={0} value={answers.wtpTooCheap ?? ""} onChange={(e) => set("wtpTooCheap", num(e.target.value))} />
            </div>
            <div>
              <label className="label">Too expensive ($/mo)</label>
              <input className="input" type="number" min={0} value={answers.wtpTooExpensive ?? ""} onChange={(e) => set("wtpTooExpensive", num(e.target.value))} />
            </div>
          </div>
        </Q>
        <Q n={7} title="What does a user do when they 'get it'?" help="One concrete action. The attribution snippet tracks it as the activation event.">
          <input className="input" placeholder="e.g. exports first report" value={answers.activationEvent} onChange={(e) => set("activationEvent", e.target.value)} />
        </Q>
        <Q n={8} title="What does one active user cost you per month?" help="AI tokens, APIs, storage. Zero is fine.">
          <input className="input" type="number" min={0} step="0.5" placeholder="e.g. 1.50" value={answers.costToServeMonthly ?? ""} onChange={(e) => set("costToServeMonthly", num(e.target.value))} />
        </Q>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={run} disabled={pending}>
            {pending ? "Working…" : rec ? "Recalculate" : "Get my pricing"}
          </button>
          {saved ? <span className="text-sm text-[var(--muted)]">{saved}</span> : null}
        </div>
      </div>

      <div className="space-y-4">
        {!effective ? (
          <div className="card p-8 text-sm text-[var(--muted)]">Answer the eight questions and your recommendation appears here: the model, the tiers, the price points and why. Every number stays editable.</div>
        ) : (
          <>
            <div className="card p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">
                  Recommended: {effective.model === "one_time" ? "one-time purchase" : effective.model === "usage" ? "subscription with usage" : "subscription"}
                </h2>
                <span className="badge">anchor {usd(effective.anchorMonthlyCents)}/mo</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {tiers.map((t) => (
                  <div key={t.key} className={`rounded-xl border p-4 ${t.highlighted ? "border-stone-900" : "border-stone-200"}`}>
                    <input className="input mb-2 font-semibold" value={t.name} onChange={(e) => edit(t.key, { name: e.target.value })} aria-label="Tier name" />
                    <label className="label">{effective.model === "one_time" ? "Price" : "Monthly"} (USD)</label>
                    <input className="input" type="number" min={0} step={1} value={t.priceCents / 100} onChange={(e) => edit(t.key, { priceCents: Math.max(0, Math.round((num(e.target.value) ?? 0) * 100)) })} />
                    {effective.model !== "one_time" ? (
                      <>
                        <label className="label mt-2">Yearly (USD)</label>
                        <input className="input" type="number" min={0} step={1} value={t.yearlyPriceCents === null ? "" : t.yearlyPriceCents / 100} placeholder="none" onChange={(e) => edit(t.key, { yearlyPriceCents: e.target.value.trim() === "" ? null : Math.max(0, Math.round((num(e.target.value) ?? 0) * 100)) })} />
                      </>
                    ) : null}
                    <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                      {t.features.map((f) => (
                        <li key={f}>✓ {f}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <h3 className="mt-6 font-semibold">Why</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
                {effective.reasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
              {effective.gaps.length ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="font-semibold">Would sharpen this:</div>
                  <ul className="mt-1 list-disc pl-5">
                    {effective.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="card p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Pricing page block</h3>
                <div className="flex gap-2">
                  <CopyButton text={prompt} label="Copy Lovable prompt" onCopied={() => p.onCopied?.()} />
                  <CopyButton text={html} label="Copy HTML" onCopied={() => p.onCopied?.()} />
                </div>
              </div>
              <p className="help">Paste the prompt into Lovable / Bolt, or the HTML straight into your page. {p.checkoutUrls && Object.keys(p.checkoutUrls).length ? "Buttons already point at your checkout links." : "Turn on checkout and the buttons get wired to real links."}</p>
              <div className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white">
                <iframe title="Pricing preview" srcDoc={html} className="h-[420px] w-full" sandbox="" />
              </div>
              <pre className="code mt-3 max-h-48">{prompt}</pre>
            </div>

            {p.mode === "standalone" ? (
              <div className="card p-6">
                <h3 className="font-semibold">Ready to charge this?</h3>
                <p className="help">Create a free account, connect your app, and this pricing becomes live checkout links in a couple of minutes.</p>
                <Link href="/signup?next=/app/new" className="btn btn-primary mt-3">
                  Turn this into checkout
                </Link>
              </div>
            ) : p.checkoutHref ? (
              <div className="card flex flex-wrap items-center justify-between gap-3 p-6">
                <div>
                  <h3 className="font-semibold">Next: turn on checkout</h3>
                  <p className="help">Products and prices are created from these tiers. Test first, flip to live when ready.</p>
                </div>
                <Link href={p.checkoutHref} className="btn btn-primary">
                  Go to checkout
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
