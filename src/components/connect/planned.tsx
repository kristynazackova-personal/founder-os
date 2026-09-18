/**
 * Connectors that are planned but not built: they are listed so the gap is
 * visible and named, and they are NOT links - a card that cannot be completed
 * should not look like one that can.
 *
 * Push and email are here because the B2C analytics Loops tab is locked
 * without them (domain/notes.ts `loops_locked`): Founder OS cannot see a
 * customer's sends, so until one of these exists that page shows its layout
 * and no numbers.
 */
export type PlannedConnector = {
  key: string;
  name: string;
  tagline: string;
  /** What it would unlock, in the founder's terms. */
  unlocks: string;
  examples: string[];
};

export const PLANNED_CONNECTORS: PlannedConnector[] = [
  {
    key: "push",
    name: "Push notifications",
    tagline: "Sends, opens and what came back afterwards",
    unlocks: "The Loops tab in B2C analytics: push by trigger, and returns within 48 hours of a send.",
    examples: ["Expo", "Firebase Cloud Messaging", "OneSignal", "Customer.io"],
  },
  {
    key: "email",
    name: "Lifecycle email",
    tagline: "Sends, opens, clicks and returns per campaign",
    unlocks: "The Loops tab: onboarding nudges, trial reminders and win-backs against what they produced.",
    examples: ["SendGrid", "Resend", "Postmark", "Customer.io", "Loops.so"],
  },
];

export function PlannedConnectors() {
  return (
    <section className="card p-6">
      <h2 className="font-semibold">Coming: push and email</h2>
      <p className="help">
        Founder OS cannot see your app&apos;s sends, which is why the Loops tab in B2C analytics is locked. These two
        connectors are what unlock it. They are not built yet, and nothing on that page is estimated in the meantime.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {PLANNED_CONNECTORS.map((c) => (
          <div key={c.key} className="flex items-start gap-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5">
            <span className="mt-0.5 flex-none text-[var(--muted)]" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{c.name}</div>
                <span className="badge">planned</span>
              </div>
              <div className="mt-0.5 text-sm text-[var(--muted)]">{c.tagline}</div>
              <div className="mt-2 text-xs text-[var(--muted)]">{c.unlocks}</div>
              <div className="mt-2 text-xs text-[var(--muted)]">Likely providers: {c.examples.join(" · ")}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
