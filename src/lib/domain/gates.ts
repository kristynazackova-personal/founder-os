/**
 * Gates - the thresholds a B2C metric is judged against, derived per app from
 * its industry and how it sells, so a founder sees "below gate" rather than
 * an unlabelled number.
 *
 * Pure (no DB, no env, no network), unit-checked in tests/gates.test.ts.
 *
 * Two layers, in this order:
 *  1. `CATEGORY_BANDS` - published benchmarks for the category, each carrying
 *     its own source. This layer is deterministic, needs no API key, and is
 *     what every app gets the moment it is created.
 *  2. Researched gates - a per-app pass over competitor apps in the same
 *     category (services/gateResearch.ts) that can TIGHTEN or LOOSEN a band
 *     and must supply its own citation. Validated by `parseResearchedGates`;
 *     anything without a number and a source is thrown away.
 *
 * A gate is never invented. If neither layer can supply one, the metric has
 * no gate and the tile says so - the same rule as "—" never meaning zero.
 */

// ---------------------------------------------------------------- taxonomy

export const INDUSTRIES = [
  "health_fitness",
  "mental_health",
  "education",
  "productivity",
  "finance",
  "dating_social",
  "entertainment",
  "ecommerce",
  "b2b_saas",
  "developer_tools",
  "marketplace",
  "other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRY_LABEL: Record<Industry, string> = {
  health_fitness: "Health & fitness",
  mental_health: "Mental health & wellbeing",
  education: "Education & learning",
  productivity: "Productivity",
  finance: "Finance & fintech",
  dating_social: "Dating & social",
  entertainment: "Entertainment & media",
  ecommerce: "Ecommerce & retail",
  b2b_saas: "B2B SaaS",
  developer_tools: "Developer tools",
  marketplace: "Marketplace",
  other: "Something else",
};

/** How the thing is sold. This moves the conversion gates far more than the industry does. */
export const NATURES = ["app_subscription", "web_subscription", "freemium", "one_off", "marketplace_fee"] as const;
export type Nature = (typeof NATURES)[number];

export const NATURE_LABEL: Record<Nature, string> = {
  app_subscription: "Mobile app subscription (with a trial)",
  web_subscription: "Web subscription",
  freemium: "Freemium - free tier, paid upgrade",
  one_off: "One-off purchase",
  marketplace_fee: "Marketplace / take-rate",
};

export type BusinessProfile = { industry: Industry; nature: Nature };

// ---------------------------------------------------------------- gates

/** The metrics a gate can be set on. Each maps to one B2C analytics tile. */
export const GATE_METRICS = ["d1", "d7", "d30", "activation", "north_star", "signup_to_paid", "trial_to_paid", "churn_30d"] as const;
export type GateMetric = (typeof GATE_METRICS)[number];

export const GATE_METRIC_LABEL: Record<GateMetric, string> = {
  d1: "D1 retention",
  d7: "D7 retention",
  d30: "D30 retention",
  activation: "Activated ≤ 24 h",
  north_star: "North star · second activation ≤ 7 d",
  signup_to_paid: "Signup → paid",
  trial_to_paid: "Trial → paid",
  churn_30d: "Churn, 30 days",
};

/** True when a HIGHER number is better. Churn is the exception. */
export const GATE_HIGHER_IS_BETTER: Record<GateMetric, boolean> = {
  d1: true, d7: true, d30: true, activation: true, north_star: true, signup_to_paid: true, trial_to_paid: true, churn_30d: false,
};

export type Gate = {
  metric: GateMetric;
  /** The threshold to clear, as a fraction. For churn_30d it is a ceiling. */
  target: number;
  /** The wider band the category sits in, for context beside the target. */
  band: { low: number; high: number } | null;
  /** Where the number comes from, in the founder's words. */
  source: string;
  /** "category" = published benchmarks; "researched" = a competitor pass for this app. */
  origin: "category" | "researched";
  /** Why this app gets this number rather than the category median. */
  rationale?: string;
};

export type GateSet = {
  profile: BusinessProfile;
  gates: Gate[];
  origin: "category" | "researched" | "mixed";
  generatedAt: string;
  /** What the research pass looked at, when it ran. Empty for category-only. */
  competitors: string[];
  notes: string[];
};

// ---------------------------------------------------------------- the catalog

type Band = { target: number; low: number; high: number; source: string };

/**
 * Published retention benchmarks, September 2026. The global row is the
 * all-category median; a category row overrides it where the published data
 * differs materially. Sources are named on the tile, so they are written the
 * way a founder would want to read them.
 */
const RETENTION: Partial<Record<Industry, { d1: Band; d7: Band; d30: Band }>> & { default: { d1: Band; d7: Band; d30: Band } } = {
  default: {
    d1: { target: 0.26, low: 0.2, high: 0.32, source: "All-category mobile median, 2026 (26% D1)" },
    d7: { target: 0.13, low: 0.08, high: 0.18, source: "All-category mobile median, 2026 (13% D7)" },
    d30: { target: 0.07, low: 0.04, high: 0.11, source: "All-category mobile median, 2026 (7% D30)" },
  },
  health_fitness: {
    d1: { target: 0.2, low: 0.15, high: 0.26, source: "Health & fitness category, 2026 (≈20% D1)" },
    d7: { target: 0.08, low: 0.07, high: 0.085, source: "Health & fitness category, 2026 (7–8.5% D7)" },
    d30: { target: 0.04, low: 0.035, high: 0.072, source: "Health & fitness, 2026 (3.5–4%; 7.2% with wearable sync)" },
  },
  mental_health: {
    d1: { target: 0.2, low: 0.15, high: 0.26, source: "Nearest published category is health & fitness (≈20% D1)" },
    d7: { target: 0.08, low: 0.07, high: 0.085, source: "Nearest published category is health & fitness (7–8.5% D7)" },
    d30: { target: 0.04, low: 0.035, high: 0.07, source: "Nearest published category is health & fitness (3.5–4% D30)" },
  },
  education: {
    d1: { target: 0.22, low: 0.16, high: 0.3, source: "Education apps run below the all-category median" },
    d7: { target: 0.07, low: 0.04, high: 0.12, source: "Education apps, 2026" },
    d30: { target: 0.02, low: 0.015, high: 0.1, source: "Education, 2026 (≈2% D30; above 10% outperforms the category)" },
  },
  finance: {
    d1: { target: 0.26, low: 0.2, high: 0.34, source: "All-category median; fintech reads at or above it" },
    d7: { target: 0.15, low: 0.1, high: 0.22, source: "Fintech, 2026 - one of the stronger categories" },
    d30: { target: 0.15, low: 0.1, high: 0.25, source: "Fintech, 2026 (15–25% D30)" },
  },
  entertainment: {
    d1: { target: 0.26, low: 0.2, high: 0.32, source: "All-category median" },
    d7: { target: 0.12, low: 0.08, high: 0.18, source: "All-category median" },
    d30: { target: 0.06, low: 0.03, high: 0.1, source: "Entertainment converts and retains below the median" },
  },
};

/** Conversion benchmarks by how the thing is sold. The spread here is enormous and is reported as such. */
const CONVERSION: Record<Nature, { signup_to_paid: Band; trial_to_paid?: Band; churn_30d: Band }> = {
  app_subscription: {
    signup_to_paid: { target: 0.03, low: 0.01, high: 0.08, source: "Mobile install → paid, 2026 (≈2.9% for health & fitness)" },
    trial_to_paid: { target: 0.256, low: 0.1, high: 0.45, source: "Global median trial → paid ≈25.6%, 2026; hard paywalls ≈10.7% at D35, freemium ≈2.1%" },
    churn_30d: { target: 0.08, low: 0.04, high: 0.14, source: "Consumer subscription monthly churn" },
  },
  web_subscription: {
    signup_to_paid: { target: 0.08, low: 0.025, high: 0.25, source: "Free trial → paid median ≈8%, 2026 - a bimodal distribution, not a bell curve" },
    trial_to_paid: { target: 0.15, low: 0.08, high: 0.3, source: "Self-serve web trial → paid, 2026" },
    churn_30d: { target: 0.05, low: 0.03, high: 0.07, source: "SMB / self-serve SaaS monthly churn 3–7%, 2026" },
  },
  freemium: {
    signup_to_paid: { target: 0.045, low: 0.02, high: 0.12, source: "Freemium free → paid median ≈4.5% (2–8%); 8–12% is excellent, 2026" },
    churn_30d: { target: 0.05, low: 0.03, high: 0.07, source: "SMB / self-serve SaaS monthly churn 3–7%, 2026" },
  },
  one_off: {
    signup_to_paid: { target: 0.03, low: 0.01, high: 0.08, source: "Self-serve checkout view → purchase, public indie data" },
    churn_30d: { target: 0, low: 0, high: 0, source: "No recurring charge, so churn does not apply" },
  },
  marketplace_fee: {
    signup_to_paid: { target: 0.05, low: 0.02, high: 0.15, source: "Marketplace signup → first transaction, public data" },
    churn_30d: { target: 0.08, low: 0.05, high: 0.15, source: "Marketplace repeat-use decay" },
  },
};

/** B2B SaaS churn is its own number and does not follow the consumer bands. */
const B2B_CHURN: Band = { target: 0.035, low: 0.012, high: 0.05, source: "B2B SaaS median monthly churn 3.5%, 2026; top quartile under 1.2%" };

const gate = (metric: GateMetric, b: Band, rationale?: string): Gate => ({
  metric,
  target: b.target,
  band: { low: b.low, high: b.high },
  source: b.source,
  origin: "category",
  rationale,
});

/**
 * The gates an app gets at creation, from published category data alone.
 * Deterministic and offline: every app has judged tiles from day one, before
 * any research pass runs and whether or not one ever can.
 */
export function categoryGates(profile: BusinessProfile, now = new Date()): GateSet {
  const ret = RETENTION[profile.industry] ?? RETENTION.default;
  const conv = CONVERSION[profile.nature];
  const gates: Gate[] = [gate("d1", ret.d1), gate("d7", ret.d7), gate("d30", ret.d30), gate("signup_to_paid", conv.signup_to_paid)];

  if (conv.trial_to_paid) gates.push(gate("trial_to_paid", conv.trial_to_paid));
  if (profile.nature !== "one_off") {
    gates.push(gate("churn_30d", profile.industry === "b2b_saas" || profile.industry === "developer_tools" ? B2B_CHURN : conv.churn_30d));
  }

  const notes = [
    "Set from published benchmarks for this category the moment the app was created - not from your own data, which does not exist yet.",
  ];
  if (profile.industry === "mental_health") notes.push("There is no published band for mental-health apps specifically; the health & fitness one is the closest honest proxy.");
  if (conv.trial_to_paid) notes.push("Trial → paid varies more than any other metric here: where the paywall sits moves it several times over, so treat the band as the answer and the target as its middle.");

  return { profile, gates, origin: "category", generatedAt: now.toISOString(), competitors: [], notes };
}

// ---------------------------------------------------------------- research

/** What a research pass is asked to return, before validation. */
export type ResearchedGateInput = {
  metric?: unknown;
  target?: unknown;
  low?: unknown;
  high?: unknown;
  source?: unknown;
  rationale?: unknown;
};

const asFraction = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace("%", "")) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  // A pass may answer in percent or as a fraction; anything above 1 is percent.
  const f = n > 1 ? n / 100 : n;
  return f > 1 ? null : f;
};

/**
 * Keep only what a research pass can actually justify: a known metric, a
 * number in range, and a source naming where it came from. Everything else is
 * dropped - a gate with no provenance is worse than no gate.
 */
export function parseResearchedGates(input: unknown): Gate[] {
  if (!Array.isArray(input)) return [];
  const out: Gate[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as ResearchedGateInput;
    const metric = typeof r.metric === "string" ? (r.metric as GateMetric) : null;
    if (!metric || !(GATE_METRICS as readonly string[]).includes(metric) || seen.has(metric)) continue;
    const target = asFraction(r.target);
    const source = typeof r.source === "string" ? r.source.trim().slice(0, 300) : "";
    if (target === null || source.length < 8) continue;
    const low = asFraction(r.low);
    const high = asFraction(r.high);
    out.push({
      metric,
      target,
      band: low !== null && high !== null && high >= low ? { low, high } : null,
      source,
      origin: "researched",
      rationale: typeof r.rationale === "string" ? r.rationale.trim().slice(0, 400) : undefined,
    });
    seen.add(metric);
  }
  return out;
}

/** Researched gates win per metric; category gates fill every gap. */
export function mergeGates(base: GateSet, researched: Gate[], opts: { competitors?: string[]; notes?: string[]; now?: Date } = {}): GateSet {
  if (researched.length === 0) return base;
  const byMetric = new Map<GateMetric, Gate>(base.gates.map((g) => [g.metric, g]));
  for (const g of researched) byMetric.set(g.metric, g);
  const gates = [...byMetric.values()];
  const anyCategory = gates.some((g) => g.origin === "category");
  return {
    profile: base.profile,
    gates,
    origin: anyCategory ? "mixed" : "researched",
    generatedAt: (opts.now ?? new Date()).toISOString(),
    competitors: opts.competitors ?? base.competitors,
    notes: [...base.notes, ...(opts.notes ?? [])],
  };
}

// ---------------------------------------------------------------- judging

export type GateJudgement = { verdict: "good" | "warn" | "none"; label: string; target: string };

const asPct = (f: number, digits = f < 0.1 ? 1 : 0): string => `${(f * 100).toFixed(digits)}%`;

/**
 * Judge a value against its gate. A null value is never a failure - it is an
 * absence, and reads "no data". `minN` guards the same way a rate does: a gate
 * cannot be passed or failed on a handful of people.
 */
export function judgeAgainstGate(value: number | null, gate: Gate | undefined, n: number, minN: number): GateJudgement {
  if (!gate) return { verdict: "none", label: "no gate for this metric", target: "" };
  const higher = GATE_HIGHER_IS_BETTER[gate.metric];
  const target = `Gate: ${higher ? "≥" : "≤"} ${asPct(gate.target)}${gate.band ? ` · category band ${asPct(gate.band.low)}–${asPct(gate.band.high)}` : ""} · ${gate.source}`;
  if (value === null) return { verdict: "none", label: "no data yet", target };
  if (n < minN) return { verdict: "none", label: `n too small to judge (${n})`, target };
  const passed = higher ? value >= gate.target : value <= gate.target;
  return { verdict: passed ? "good" : "warn", label: passed ? "on gate" : "below gate", target };
}

export const gateFor = (set: GateSet | null, metric: GateMetric): Gate | undefined => set?.gates.find((g) => g.metric === metric);

/** Round-trip guard for the jsonb column: anything not a GateSet reads as absent. */
export function parseGateSet(value: unknown): GateSet | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<GateSet>;
  if (!v.profile || !Array.isArray(v.gates)) return null;
  const industry = (INDUSTRIES as readonly string[]).includes(String(v.profile.industry)) ? (v.profile.industry as Industry) : "other";
  const nature = (NATURES as readonly string[]).includes(String(v.profile.nature)) ? (v.profile.nature as Nature) : "web_subscription";
  const gates = v.gates.filter((g): g is Gate => Boolean(g) && (GATE_METRICS as readonly string[]).includes(String(g.metric)) && typeof g.target === "number");
  return {
    profile: { industry, nature },
    gates,
    origin: v.origin === "researched" || v.origin === "mixed" ? v.origin : "category",
    generatedAt: typeof v.generatedAt === "string" ? v.generatedAt : new Date(0).toISOString(),
    competitors: Array.isArray(v.competitors) ? v.competitors.filter((c): c is string => typeof c === "string") : [],
    notes: Array.isArray(v.notes) ? v.notes.filter((c): c is string => typeof c === "string") : [],
  };
}
