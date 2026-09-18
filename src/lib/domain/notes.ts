/**
 * Measurement notes — the things a founder has to know to read a number
 * correctly, shown in the app next to the number rather than buried in a doc.
 *
 * Pure data. Each note names where it appears, so a note can never exist
 * without a home, and the Coverage view lists every one of them in a single
 * place.
 */
export const NOTE_SURFACES = ["overview", "acquisition", "activation", "revenue", "loops", "coverage"] as const;
export type NoteSurface = (typeof NOTE_SURFACES)[number];

export type MeasurementNote = {
  key: string;
  title: string;
  body: string;
  /** What to do about it, when there is something. */
  action?: string;
  surfaces: NoteSurface[];
};

export const MEASUREMENT_NOTES: MeasurementNote[] = [
  {
    key: "platform_from_install",
    title: "Everyone reads as web until your app reports an install",
    body:
      "The only platform signal the snippet carries is the install event. A visitor counts as app if they ever reported an install or arrived with a store source; otherwise they count as web. So before a build ships that calls install, the web/app split on these pages is not wrong so much as blind — it will say 100% web.",
    action: "Send the install event from the app on first launch, with utmSource set to the store. The snippet for it is on the Attribution tab.",
    surfaces: ["acquisition", "coverage"],
  },
  {
    key: "cohort_identity",
    title: "A person on two devices counts as two people",
    body:
      "Cohorts key on the snippet's anonymous id, which belongs to a device and a browser, not to a human. Someone who signs up on their laptop and comes back on their phone appears as two visitors: one who signed up and never returned, and one who returned without signing up. It inflates signups slightly and deflates retention.",
    action: "Nothing to configure — fixing it needs an identity the snippet does not have. Read retention as a floor.",
    surfaces: ["activation", "coverage"],
  },
  {
    key: "checkout_view_coverage",
    title: "Checkout → paid is only as good as the event behind it",
    body:
      "checkout_view fires from our own hosted pay page and from anywhere your app calls it. If your paywall or pricing screen does not call it, the step before payment is invisible and the conversion reads as a blank or a bare count pair — not as zero.",
    action: "Call window.fos('checkout_view') when the paywall opens. On mobile, post it with the same anonId as the install.",
    surfaces: ["revenue", "coverage"],
  },
  {
    key: "loops_locked",
    title: "Loops is locked until a push or email source is connected",
    body:
      "Push and lifecycle email are the day-two engine, and Founder OS cannot see either one: your sends happen in your own tooling. The page is laid out and waiting — the numbers appear once a push or email provider is connected, and nothing on it is estimated in the meantime.",
    action: "Add a push or email provider under Settings → Connect your Platforms. Both are placeholders for now and say so.",
    surfaces: ["loops", "coverage"],
  },
];

/**
 * The notes for one surface. Overview deliberately carries none: a note
 * belongs next to the number it qualifies, and Coverage lists them all.
 */
export const notesFor = (surface: NoteSurface): MeasurementNote[] => MEASUREMENT_NOTES.filter((n) => n.surfaces.includes(surface));
