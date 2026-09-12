/**
 * Pricing engine. A guided interview (8 questions) → a recommended model,
 * 1 to 3 tiers, price points, plain-language reasoning tied to each answer,
 * and a pricing-page block the founder pastes into Lovable / Bolt.
 *
 * Deterministic and dependency-free so it runs in the browser (the free,
 * standalone top-of-funnel tool) and on the server (saved to an app).
 */

export type Audience = "consumer" | "prosumer" | "smb" | "b2b_team" | "developer";
export type Replaces = "nothing" | "manual_work" | "spreadsheet" | "human_service" | "another_tool";
export type ValueMetric = "flat" | "seat" | "usage" | "project";
export type Frequency = "daily" | "weekly" | "monthly" | "once";
export type PricingModel = "subscription" | "one_time" | "usage";

export type PricingAnswers = {
  audience: Audience;
  replaces: Replaces;
  /** What the user pays today, per month, for what this replaces (USD). */
  replacesCostMonthly: number | null;
  valueMetric: ValueMetric;
  frequency: Frequency;
  comparables: string;
  /** A comparable tool's monthly price (USD). */
  comparablePriceMonthly: number | null;
  /** Van Westendorp anchors, monthly USD. */
  wtpTooCheap: number | null;
  wtpTooExpensive: number | null;
  /** The action that means a user "got it". Drives the activation event. */
  activationEvent: string;
  /** Variable cost to serve one active user per month (AI, API, storage). */
  costToServeMonthly: number | null;
};

export type Tier = {
  key: string;
  name: string;
  /** Monthly price in cents (or the one-time price for one_time). */
  priceCents: number;
  /** Yearly price in cents, null for one_time / usage-only tiers. */
  yearlyPriceCents: number | null;
  unitLabel: string;
  features: string[];
  highlighted: boolean;
};

export type PricingRecommendation = {
  model: PricingModel;
  currency: "usd";
  anchorMonthlyCents: number;
  tiers: Tier[];
  reasoning: string[];
  activationEvent: string;
  /** Interview fields that are unanswered but would sharpen the result. */
  gaps: string[];
};

export const INTERVIEW_QUESTIONS = [
  { key: "audience", title: "Who is it for?", help: "The buyer, not the user, if they differ." },
  { key: "replaces", title: "What does it replace?", help: "Pricing anchors to the cost of the thing you replace." },
  { key: "valueMetric", title: "What grows when they get more value?", help: "Seats, usage, projects, or nothing in particular." },
  { key: "frequency", title: "How often do they use it?", help: "Daily habits sustain subscriptions; one-off jobs don't." },
  { key: "comparables", title: "What do they compare you with?", help: "Name one tool and what it charges per month." },
  { key: "wtp", title: "Willingness to pay", help: "At what monthly price would this feel suspiciously cheap? Too expensive?" },
  { key: "activationEvent", title: "What does a user do when they 'get it'?", help: "One concrete action, e.g. 'exports first report'. The attribution snippet tracks it." },
  { key: "costToServe", title: "What does one active user cost you per month?", help: "AI tokens, APIs, storage. Zero is fine." },
] as const;

export const PRICE_LADDER_CENTS = [
  300, 500, 700, 900, 1200, 1500, 1900, 2400, 2900, 3900, 4900, 5900, 7900, 9900, 12900, 14900, 19900, 24900, 29900, 39900, 49900, 79900, 99900,
];

/** Snap to the nearest rung of the psychological price ladder. */
export function snapToLadder(cents: number): number {
  if (cents <= PRICE_LADDER_CENTS[0]) return PRICE_LADDER_CENTS[0];
  const last = PRICE_LADDER_CENTS[PRICE_LADDER_CENTS.length - 1];
  if (cents >= last) return Math.round(cents / 10000) * 10000 - 100;
  let best = PRICE_LADDER_CENTS[0];
  let bestDist = Infinity;
  for (const rung of PRICE_LADDER_CENTS) {
    const d = Math.abs(Math.log(rung) - Math.log(cents));
    if (d < bestDist) {
      bestDist = d;
      best = rung;
    }
  }
  return best;
}

const AUDIENCE_BASE_CENTS: Record<Audience, number> = {
  consumer: 800,
  prosumer: 1500,
  developer: 2500,
  smb: 3900,
  b2b_team: 7900,
};

const AUDIENCE_LABEL: Record<Audience, string> = {
  consumer: "consumers",
  prosumer: "prosumers and creators",
  developer: "developers",
  smb: "small businesses",
  b2b_team: "teams inside companies",
};

function usd(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export function recommendPricing(a: PricingAnswers): PricingRecommendation {
  const reasoning: string[] = [];
  const gaps: string[] = [];

  // 1. Model
  let model: PricingModel;
  if (a.frequency === "once") {
    model = "one_time";
    reasoning.push("People use it once or rarely, so a subscription would churn immediately. Charge once, at a price that reflects the whole job.");
  } else if (a.valueMetric === "usage" && (a.costToServeMonthly ?? 0) > 0) {
    model = "usage";
    reasoning.push("Value scales with usage and each use costs you money, so a base subscription with included usage keeps margin safe as heavy users appear.");
  } else {
    model = "subscription";
    reasoning.push(
      a.frequency === "daily"
        ? "Daily use is a habit, and habits are what subscriptions are for."
        : "Recurring use with a stable value per month points to a plain monthly subscription.",
    );
  }

  // 2. Anchor
  let anchor = AUDIENCE_BASE_CENTS[a.audience];
  reasoning.push(`Apps sold to ${AUDIENCE_LABEL[a.audience]} typically start around ${usd(anchor)}/mo; that's the starting anchor.`);

  if (a.replacesCostMonthly && a.replacesCostMonthly > 0) {
    const replaced = Math.round(a.replacesCostMonthly * 100);
    const share = a.replaces === "human_service" ? 0.15 : a.replaces === "another_tool" ? 0.7 : 0.35;
    const valueAnchor = Math.round(replaced * share);
    anchor = Math.round((anchor + valueAnchor) / 2);
    reasoning.push(
      a.replaces === "human_service"
        ? `It replaces a service costing ~${usd(replaced)}/mo. Software that replaces people is priced at 10 to 20% of the person, so ~${usd(valueAnchor)}/mo is defensible.`
        : a.replaces === "another_tool"
          ? `It replaces a tool costing ~${usd(replaced)}/mo. A switch needs a visible saving, so ~70% of that (${usd(valueAnchor)}/mo) is the ceiling to stay under.`
          : `It replaces work worth ~${usd(replaced)}/mo. Capturing about a third of the value you create (${usd(valueAnchor)}/mo) is the usual split.`,
    );
  } else if (a.replaces === "nothing") {
    anchor = Math.round(anchor * 0.8);
    reasoning.push("It creates a new behaviour rather than replacing a cost, so there's no budget line to point at; start ~20% lower and raise it once retention proves the habit.");
  } else {
    gaps.push("What the replaced thing costs per month — the strongest anchor you can have.");
  }

  if (a.comparablePriceMonthly && a.comparablePriceMonthly > 0) {
    const comp = Math.round(a.comparablePriceMonthly * 100);
    anchor = Math.round(anchor * 0.5 + comp * 0.5);
    reasoning.push(`The comparable you named (${a.comparables || "it"}) charges ~${usd(comp)}/mo. Buyers will hold you against it, so the anchor is pulled halfway toward that.`);
  } else {
    gaps.push("A comparable tool's price — buyers will compare whether you name one or not.");
  }

  if (a.wtpTooCheap && a.wtpTooExpensive && a.wtpTooExpensive > a.wtpTooCheap) {
    const lo = Math.round(a.wtpTooCheap * 100);
    const hi = Math.round(a.wtpTooExpensive * 100);
    const geo = Math.round(Math.sqrt(lo * hi));
    if (anchor < lo || anchor > hi) {
      reasoning.push(`Your willingness-to-pay range is ${usd(lo)} to ${usd(hi)}; the anchor fell outside it, so it moves to the middle of that range (${usd(geo)}).`);
      anchor = geo;
    } else {
      reasoning.push(`The anchor sits inside your willingness-to-pay range (${usd(lo)} to ${usd(hi)}), which is where an early price should be.`);
    }
  } else {
    gaps.push("Willingness-to-pay anchors (too cheap / too expensive).");
  }

  const cost = Math.round((a.costToServeMonthly ?? 0) * 100);
  if (cost > 0) {
    const floor = cost * 3;
    if (anchor < floor) {
      reasoning.push(`Each active user costs you ${usd(cost)}/mo. A price under 3x cost leaves no room for churn or acquisition, so the floor is ${usd(floor)}/mo.`);
      anchor = floor;
    } else {
      reasoning.push(`At ${usd(cost)}/mo cost per user your gross margin at this price is ${Math.round((1 - cost / anchor) * 100)}%, which is healthy.`);
    }
  }

  const anchorMonthly = snapToLadder(anchor);
  reasoning.push(`Snapped to ${usd(anchorMonthly)} — prices ending in 9 and sitting on familiar rungs convert better than exact numbers.`);

  // 3. Tiers
  const tiers: Tier[] = [];
  const unit = a.valueMetric === "seat" ? "per seat / month" : model === "one_time" ? "one-time" : "per month";
  const yearly = (monthly: number) => monthly * 10; // two months free

  if (model === "one_time") {
    const once = snapToLadder(anchorMonthly * 4);
    tiers.push({ key: "full", name: "Full access", priceCents: once, yearlyPriceCents: null, unitLabel: "one-time", features: ["Everything, forever", "All future updates", "Email support"], highlighted: true });
    reasoning.push(`A one-time price of ~4 months of the subscription equivalent (${usd(once)}) captures the value of the job without asking for a commitment.`);
  } else if (a.audience === "consumer" || a.audience === "prosumer") {
    const pro = snapToLadder(anchorMonthly * 2.2);
    tiers.push({ key: "starter", name: "Starter", priceCents: anchorMonthly, yearlyPriceCents: yearly(anchorMonthly), unitLabel: unit, features: ["Core features", `Enough for regular ${a.frequency} use`, "Email support"], highlighted: true });
    tiers.push({ key: "pro", name: "Pro", priceCents: pro, yearlyPriceCents: yearly(pro), unitLabel: unit, features: ["Everything in Starter", "Higher limits", "Priority support", "Early access to new features"], highlighted: false });
    reasoning.push("Two tiers for individuals: one price most people pick, and a Pro tier that makes it look reasonable and catches the heaviest users.");
  } else {
    const starter = snapToLadder(anchorMonthly * 0.6);
    const team = snapToLadder(anchorMonthly * 2.5);
    tiers.push({ key: "starter", name: "Starter", priceCents: starter, yearlyPriceCents: yearly(starter), unitLabel: unit, features: ["Core features", "1 user", "Email support"], highlighted: false });
    tiers.push({ key: "growth", name: "Growth", priceCents: anchorMonthly, yearlyPriceCents: yearly(anchorMonthly), unitLabel: unit, features: ["Everything in Starter", a.valueMetric === "seat" ? "Up to 5 seats" : "Higher limits", "Integrations", "Priority support"], highlighted: true });
    tiers.push({ key: "team", name: a.valueMetric === "seat" ? "Team" : "Scale", priceCents: team, yearlyPriceCents: yearly(team), unitLabel: unit, features: ["Everything in Growth", a.valueMetric === "seat" ? "Unlimited seats" : "Unlimited usage", "Onboarding call", "SLA"], highlighted: false });
    reasoning.push("Three tiers for business buyers: the middle one is the recommendation, the top one exists so the middle looks sensible and captures the few who want everything.");
  }

  if (model === "usage") {
    tiers[0].features.push("Includes a monthly usage allowance; overage billed per unit");
    reasoning.push("Every tier includes a usage allowance; heavy users pay overage so your margin never goes negative.");
  }

  if (model !== "one_time") reasoning.push("Yearly plans at 10x monthly (two months free) pull cash forward and cut churn for people who commit.");

  return { model, currency: "usd", anchorMonthlyCents: anchorMonthly, tiers, reasoning, activationEvent: a.activationEvent.trim(), gaps };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A self-contained HTML block the founder pastes into their app. */
export function pricingPageHtml(rec: PricingRecommendation, opts: { checkoutUrls?: Record<string, string>; appName?: string } = {}): string {
  const cards = rec.tiers
    .map((t) => {
      const href = opts.checkoutUrls?.[t.key] ?? "#";
      const price = rec.model === "one_time" ? usd(t.priceCents) : `${usd(t.priceCents)}<span style="font-size:14px;color:#6b7280">/mo</span>`;
      const yearly = t.yearlyPriceCents ? `<div style="font-size:13px;color:#6b7280;margin-top:4px">or ${usd(t.yearlyPriceCents)}/year</div>` : "";
      return `    <div style="flex:1;min-width:220px;border:1px solid ${t.highlighted ? "#111827" : "#e5e7eb"};border-radius:16px;padding:24px;background:#fff">
      <div style="font-weight:600;font-size:14px;letter-spacing:.02em;text-transform:uppercase;color:#6b7280">${esc(t.name)}</div>
      <div style="font-size:36px;font-weight:700;margin:12px 0 0">${price}</div>
      <div style="font-size:13px;color:#6b7280">${esc(t.unitLabel)}</div>${yearly}
      <ul style="list-style:none;padding:0;margin:20px 0">
${t.features.map((f) => `        <li style="padding:6px 0;border-top:1px solid #f3f4f6">✓ ${esc(f)}</li>`).join("\n")}
      </ul>
      <a href="${esc(href)}" style="display:block;text-align:center;padding:12px;border-radius:10px;background:${t.highlighted ? "#111827" : "#f3f4f6"};color:${t.highlighted ? "#fff" : "#111827"};text-decoration:none;font-weight:600">${rec.model === "one_time" ? "Buy now" : "Start now"}</a>
    </div>`;
    })
    .join("\n");
  return `<section id="pricing" style="max-width:1040px;margin:0 auto;padding:48px 16px;font-family:system-ui,sans-serif">
  <h2 style="text-align:center;font-size:32px;margin:0 0 8px">Simple pricing${opts.appName ? ` for ${esc(opts.appName)}` : ""}</h2>
  <p style="text-align:center;color:#6b7280;margin:0 0 32px">${rec.model === "one_time" ? "Pay once, use forever." : "Cancel anytime. Two months free on yearly."}</p>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:stretch">
${cards}
  </div>
</section>`;
}

/** A prompt the founder pastes into Lovable / Bolt to add the pricing section. */
export function pricingPagePrompt(rec: PricingRecommendation, opts: { checkoutUrls?: Record<string, string> } = {}): string {
  const lines = rec.tiers.map((t) => {
    const price = rec.model === "one_time" ? `${usd(t.priceCents)} one-time` : `${usd(t.priceCents)}/month${t.yearlyPriceCents ? ` (${usd(t.yearlyPriceCents)}/year)` : ""}`;
    const url = opts.checkoutUrls?.[t.key];
    return `- ${t.name}: ${price}. Features: ${t.features.join(", ")}.${t.highlighted ? " Mark this tier as recommended." : ""}${url ? ` The button links to ${url}.` : ""}`;
  });
  return `Add a pricing section to the landing page with ${rec.tiers.length} tier${rec.tiers.length === 1 ? "" : "s"}:
${lines.join("\n")}
Use a clean card layout, one card per tier, the recommended card visually emphasised. ${rec.model === "one_time" ? "Button text: 'Buy now'." : "Add a monthly/yearly toggle; button text: 'Start now'."} Do not invent extra tiers or change the prices.`;
}
