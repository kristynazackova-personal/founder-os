# Founder OS

Next.js 16 App Router (see `node_modules/next/dist/docs/` — async `params`,
`cookies()`, `proxy.ts` instead of middleware), TypeScript, Tailwind 4, Drizzle.

Read `README.md`, `docs/ARCHITECTURE.md` and `docs/STAGES.md` before changing
anything. The PRDs in `docs/` define scope: V1 is this codebase; V2/V3 items
are out unless asked.

Rules that are easy to break:
- `src/lib/domain/*` stays pure (no DB, no env, no network) — it runs in the
  browser too and is unit-tested. Put orchestration in `src/lib/services/`.
- Stage rules live only in `placeStage`; document any change in `docs/STAGES.md`.
- Every checkout provider goes behind `CheckoutProvider`; webhooks go through
  `handleCheckoutWebhook` (verify → dedupe → apply). Never process an unverified body.
- Test-mode money never reaches metrics or billing.
- Schema changes: edit `src/lib/db/schema.ts`, then `npm run db:generate` and commit `drizzle/`.
- `npm test`, `npm run check`, `npm run lint`, `npm run build` must pass.

Roadmap for the current customer: `docs/ROADMAP-revenue-selvenn.md` — eight
items, built one per session in order. Items 1–2 shipped. **The next session
works on item 3 only** (paywall views from apps); update the item's status
line when it ships.
