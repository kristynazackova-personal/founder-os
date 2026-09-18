# Product Market Fit

The framework at `/app/<appId>/pmf`, and where it came from.

## Provenance

This is not a framework assembled from blog posts. It is Kristyna's own,
ported from her external-memory repo:

- Source: `kristynazackova-personal/my-personality`,
  `raw/mentoring/matium-guillen/2026-09-05.md`
- A recorded mentoring session, 5 September 2026, taking a founder with three
  clients through the whole thing end to end.
- Every quote in `src/lib/domain/pmf.ts` is verbatim from that transcript.
  The phrasing is the framework, so it was ported rather than summarised.

That repo's first rule is "never invent", and it applies here too: the page
carries her words and nothing written in her voice that she did not say. If
the framework changes, it changes in the transcript first and here second.

## The five steps

1. **The bar: would it hurt them to lose it?** PMF is not a score, it is a
   test. If a client would not be hurt by losing the product they can solve
   the problem another way. The only two ways to hurt them: you were cutting
   a lot of cost, or bringing a lot of revenue.
2. **Qualitative first.** Learn from the clients you already have, because
   they cost nothing. Users and decision-makers separately, open questions
   only, never leading, and watch a screen share rather than taking a
   description.
3. **Then quantitative.** Reduce what you heard to a few candidate solutions,
   do the market and competitive research, attach a revenue estimate to each.
4. **Prioritise: is the house going to burn?** If two things break, the one
   that breaks faster or wider goes first. If nothing breaks, order by cost
   saved or revenue added. That is the whole ladder.
5. **KPIs.** One revenue driver, a quarterly goal above it, per-launch numbers
   under it. And split test traffic from production traffic before trusting
   any of it.

Plus two supporting blocks the page renders: her interview question lists
(separate for users and for buyers) with the technique rules that make them
work, and a "not yet" section - no free trial, no market-size decision, no
per-feature revenue maths - each with her reason.

## How the page knows where you are

`pmfStateFor` in `src/lib/domain/pmf.ts` picks the current step from three
facts the app already has: paying customers (latest assessment), whether
anything is reporting (snippet signals), and whether checkout is live.

| Situation | Step | Why |
|---|---|---|
| Nobody has paid | The bar | Nobody can tell you what they would miss |
| 1 to 10 paying | Qualitative | Not a sample, a list of people to call |
| 11+ paying, nothing reporting | KPIs | Enough customers to see patterns, no way to see them |
| 11 to 50 paying, reporting | Quantitative | The conversations should be feeding candidates |
| 50+ paying | Prioritise | The bottleneck is the order of the list |

The framework is sequential on purpose. The failure it is built to prevent is
running step 3 before step 2, which is why a founder with four customers is
sent to the conversations rather than to competitor research.

## The filled-in document

The framework above is the questions. A **PMF document** is one business's
answers to it, and it is versioned.

**Fields.** `src/lib/domain/pmfDoc.ts` fixes fourteen fields across the five
steps, so the edit form, the model prompt and the stored row can never
disagree about what the framework asks for.

**When it gets written.**

| Trigger | Source | Notes |
|---|---|---|
| A business is created | `scaffold`, then `generated` | The scaffold is written synchronously, so the tab is never empty. The model fill appends v2 in the background when a key is configured. |
| An existing business, on demand | `scaffold` / `generated` | A business that predates this feature has no document and gets a "Fill in the framework" button. Selvenn is the case this was built for. |
| The founder edits a step | `edited` | Appends a version. |
| The founder asks for a rewrite | `rewritten` | The comment is stored with the version it produced. |

**Nothing is overwritten.** `pmf_documents` is append-only: one row per
version, unique on (app, version), and the newest row is the live document.
The first draft is always still there, next to what the founder changed. A
concurrent save loses the unique-index race, re-reads and rebases rather than
clobbering.

**The scaffold never guesses.** Every field it writes is a question aimed at
that specific business, prefixed `[to fill]`, because a guessed answer would
be read as a finding. The model prompt carries the same rule: where it does
not know something about this business it must write the question, and it is
told explicitly not to invent a customer, a competitor's number, a revenue
figure or an interview finding. `parseModelValues` then drops any field the
framework did not ask for, any non-string, any blank, and bounds the rest.

**Rewriting needs a model.** Without `GATE_RESEARCH_API_KEY` the rewrite box
says so and points at the edit form, which also writes a version. Generation
still works without a key - it just stops at the scaffold.

## Where the code lives

```
src/lib/domain/pmf.ts             the framework as data, the quotes, pmfStateFor
src/lib/domain/pmfDoc.ts          the fields, the scaffold, versioning, model-output parsing
src/lib/services/pmfDocs.ts       read, generate, edit, rewrite (append-only)
src/lib/services/ai.ts            the one place a model gets called
src/app/actions/pmf.ts            generate / save / rewrite, each revalidating the page
src/components/pmf/PmfEditor.tsx  per-step answers, edit form, rewrite box, version list
src/app/app/[appId]/pmf/page.tsx  the tab
tests/pmf.test.ts                 step order, completeness, the em-dash rule, state picking
tests/pmfDoc.test.ts              fields, scaffold, versioning, the parser's refusals
```

Pure domain, no schema, no writes, and nothing on the page depends on a
source being connected. One of the tests asserts that no ported string
contains an em dash, which is her standing instruction and easy to
reintroduce by accident.
