/**
 * The B2C section list, in a module with no "use client".
 *
 * This lived in B2cNav.tsx, which is a client component, and the server pages
 * imported it from there. Across that boundary a client module's data exports
 * are not the values - only component references survive - so
 * `B2C_SECTIONS.find` threw at runtime and every B2C page 500'd. Types,
 * builds and unit tests all passed, because nothing type-checks the boundary.
 *
 * The rule this encodes: shared DATA goes in a plain module that both sides
 * import. A "use client" file exports components, and types.
 */
export const B2C_SECTIONS = [
  { seg: "", key: "overview", label: "Overview", sub: "the weekly read - every tile carries its n, its band and its source" },
  { seg: "/acquisition", key: "acquisition", label: "Acquisition", sub: "where signups come from, and what each channel's users did next" },
  { seg: "/activation", key: "activation", label: "Activation & retention", sub: "did day two happen, and did the week - cohorts by signup week" },
  { seg: "/revenue", key: "revenue", label: "Revenue", sub: "checkout to trial to paid, across every connected rail" },
  { seg: "/loops", key: "loops", label: "Loops", sub: "push and lifecycle email - locked until a provider is connected" },
  { seg: "/coverage", key: "coverage", label: "Coverage", sub: "what this dashboard cannot answer yet, and which connection fixes it" },
] as const;

export type B2cSectionKey = (typeof B2C_SECTIONS)[number]["key"];

/** Window choices for the control bar, in complete ISO weeks. */
export const WEEK_CHOICES = [1, 2, 4, 8, 12, 26];
