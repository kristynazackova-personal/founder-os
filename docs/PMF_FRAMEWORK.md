# Product Market Fit

Two frameworks at `/app/<appId>/pmf`, switched by `?framework=`, each with its
own document and its own version history.

| id | Label | For | Source |
|---|---|---|---|
| `conversation` | The PMF conversation | A business that already has customers | A recorded mentoring session, Sep 2026 |
| `build` | The product framework | Something being built or scoped | Her written Product Framework doc, Jun 2026 |

`domain/pmfFrameworks.ts` is the registry; `domain/pmf.ts` stays the record of
what she said in the session, and the `conversation` framework wraps it.

## The build framework will not answer for you

Its own first rule: *"The ideas should be yours. I'm deliberately not handing
you solutions - you won't love a product you didn't come up with."*

So a framework declares `aiRole`, and the two differ:

- `conversation` is `fill`: the tool may draft answers from what it knows.
- `build` is `pressure_test`: it may only write the sharpest version of each
  question for this business, and challenge answers the founder already
  wrote. The prompt states that proposing a segment, a pain, a solution or a
  metric breaks the framework's first rule, and every returned field must
  start with `[to fill]` unless it is pressure-testing existing words.

Her second rule - *"Use your AI as you go… just make the decisions
yourself"* - is why the box on that framework reads "pressure-test or
re-frame" rather than "rewrite".

## Provenance of the conversation framework

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

**Fields belong to the framework.** Each owns its field list (fourteen for
`conversation`, twenty-seven across nine stages for `build`), so the edit
form, the model prompt and the stored row can never disagree about what is
asked. `parseModelValues` is per framework and drops a field belonging to the
other one, so a build answer can never land in a conversation document.

**When it gets written.**

| Trigger | Source | Notes |
|---|---|---|
| A business is created | `scaffold`, then `generated` | BOTH frameworks are scaffolded synchronously, so either tab is usable on the first visit. The model pass appends v2 in the background when a key is configured. |
| An existing business, on demand | `scaffold` / `generated` | A business that predates this feature has no document and gets a "Fill in the framework" button. Selvenn is the case this was built for. |
| The founder edits a step | `edited` | Appends a version. |
| The founder asks for a rewrite | `rewritten` | The comment is stored with the version it produced. |

**Nothing is overwritten.** `pmf_documents` is append-only: one row per
version, unique on (app, **framework**, version), so the two frameworks
version independently and the newest row per framework is live.
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

## Stage 1 is prefilled; nothing else is

The build framework refuses to answer for the founder - that is `aiRole:
"pressure_test"` and it is the point. Stage 1 is the single exemption, and the
line is drawn deliberately.

Stage 1 asks what the product does, what the user gets, what the FOUNDER wants
out of it and what six months looks like. That is a description of a business
which already exists, usually on its own landing page. Her first rule protects
the IDEAS - the segments, the pains, the solutions - and was never meant to
make someone retype their own homepage. Every stage below stage 1 stays behind
its own button, one at a time: there is no "run the whole thing" control, and
deliberately so, because stage 3 derives from a stage 2 the founder is meant to
have read and corrected first.

**Evidence**: the founder reads their website, uploads a business case, or
both. The panel SHOWS the address it will run against - prefilled from the
business URL in Settings - and it is editable, so a run can be pointed at a
landing page, a different product or a competitor without touching the
business record. Changing it there changes only that run; a separate,
unticked-by-default checkbox offers to save it back to Settings, because
quietly rewriting a business setting from a side panel is how a founder loses
a URL they did not know they were editing. `domain/url.ts` normalises the
address for both the panel and Settings, so the two can never disagree about
whether it changed. The site is fetched and reduced to its visible words; an upload may be
PDF, Word `.docx`, or plain text, up to 10 MB. Both are normalised and capped
at 40,000 characters - stage 1 is four sentences, and a longer document is not
a better one. Everything fails soft and says why: a site rendered entirely by
JavaScript, a scanned PDF with no text layer, a file type nobody can read.

**The one field it must not guess.** "What do YOU want out of it" is the most
load-bearing answer in the framework - it is what drops the pay-strength column
for an impact-first founder, and it steers every table below. A landing page is
marketing copy written for customers, and it will happily imply a revenue
motive the founder does not hold. The prompt is told to ask rather than infer
unless they say it plainly, and it holds: fed a page reading "Pro from
$8/month", the prefill still returned `[to fill] What do you, the founder, want
out of FocusTimer?` rather than inventing a revenue goal.

A field it cannot answer comes back as a `[to fill]` question, and the status
line names which ones, so the founder can see what it knew and what it is
asking. Only stage-1 keys are ever written, whatever the model returns.

Where it lives: `domain/businessCase.ts` (pure: file kinds, limits, HTML to
text), `domain/pmfPrefill.ts` (the prompt and its rules),
`services/businessCase.ts` (the fetch and the parsers),
`prefillGoalStage` in `services/pmfDocs.ts`, `PrefillPanel` in
`components/pmf/PmfEditor.tsx`.

**`pdfjs-dist` and `mammoth` must stay in `serverExternalPackages`.** Bundled
by Turbopack they fail at runtime with an unhelpful message, and the unit tests
import them directly so they pass regardless. Only running the real app catches
it.

## Three of the build stages are tables

Target user, problem and solutions are lists with parameters, not paragraphs.
Her doc gives each of them a small table and then invites you to change it:

> "Feel free to add or remove the parameters I proposed to look at based on
> what you care about. E.g., do you not care about profit? Then don't look at
> the willingness to pay or pay strength."

So **the column set is an output of the framework, not part of its
definition**. A table field is marked `table: true` in the registry, and its
stored value is JSON holding its columns AND its rows together - a row can
never be read against a column set it was not filled in under.

**Columns come from the stages above, and only from those.** The generator
feeds the model the answers from this table's stage and every stage before it,
never the ones after, because a later stage is downstream of this one and
feeding it back would be circular. Segments are derived from stage 1 (what it
does, the user's outcome, what the FOUNDER wants, the six-month picture),
pains from stage 1 plus the chosen segment, solutions from those plus the
chosen pains. **Earlier tables count as answers**: `renderTableForPrompt`
passes their filled rows down, so the pains table reads the segments the
founder actually wrote and the solutions table reads the pains. Without it
each table derived its columns from the prose fields alone - which looked
right in the segment table, where stage 1 is all there is, and quietly broke
the chain below it. The strongest signal is *what do you want out of it*: an
impact-first answer drops pay-strength, which is her own example, and it does
exactly that in practice - a founder who wrote "usefulness and thank-yous, I
do not care about profit" got size, urgency, already-solved, reachability,
early-adopter tendency and can-you-talk-to-one-this-week, and no pay-strength
column at all.

**Three rules the table format cannot be allowed to break.**

- *The first column names the row.* Six scoring parameters and no label is a
  scorecard with nothing on it. `withRowLabelColumn` adds it back if the model
  forgets, dropping the weakest parameter if that pushes the set past six.
- *A cell has to fit its own control.* `[to fill]` questions belong in text
  cells. A choice or scale cell takes a listed option or a number in range -
  anything else is dropped by `cellValue`, on the way in from the model and on
  the way in from the form alike, because the select cannot render it and the
  page would show a dash while the document said something else.
- *The journey stays outside the product.* Stage 3's pains hang off how the
  person reaches the outcome TODAY, with whatever they use now. Left to
  itself the model anchors them to the product's own interface ("when they
  open the app", "when they hit the free tier limit"), which is usability
  feedback on something that may not need to exist - and it is her own
  warning, since a pain outside the product is invisible to a journey drawn
  inside it.
- *The founder's rows are theirs.* "Re-derive columns" is a deliberate button,
  never automatic: re-deriving silently would rewrite the question after the
  answers were given. The save form posts the stored column set back, so a row
  is always saved against the columns that were on screen.

**Where the reasoning lives.** `docs/research/pmf-build/` is one file per
stage - what her doc fixes, what the prioritisation literature adds, and the
condition each candidate column earns its place under.
`src/lib/domain/pmfPrompts.ts` is the operational form of those files. Change
the research first and the prompt second, or the reasoning goes missing the
moment someone edits a rule.

**It needs a model and it is not fast.** Two calls in sequence - columns, then
rows against those columns - take 40 to 50 seconds. The button says what it is
doing while it runs. Without a key the empty state says so and rows can still
be added by hand.

## Where the code lives

```
src/lib/domain/pmf.ts             the conversation framework's stages and quotes, pmfStateFor
src/lib/domain/pmfFrameworks.ts   the registry: both frameworks, their fields, their aiRole
src/lib/domain/pmfDoc.ts          the fields, the scaffold, versioning, model-output parsing
src/lib/domain/pmfTable.ts        the table model: columns, rows, and what a cell may hold
src/lib/domain/pmfPrompts.ts      the table prompts, generated from docs/research/pmf-build/
src/lib/services/pmfDocs.ts       read, generate, edit, rewrite (append-only)
src/lib/services/ai.ts            the one place a model gets called
src/app/actions/pmf.ts            generate / save / rewrite, each revalidating the page
src/components/pmf/PmfEditor.tsx  per-step answers, edit form, rewrite box, version list
src/components/pmf/PmfTable.tsx   a table stage: derive columns, edit rows, save a version
src/app/app/[appId]/pmf/page.tsx  the tab
tests/pmf.test.ts                 step order, completeness, the em-dash rule, state picking
tests/pmfDoc.test.ts              fields, scaffold, versioning, the parser's refusals
tests/pmfFrameworks.test.ts       both frameworks' integrity, and that build never answers
tests/pmfTable.test.ts            the table parser, the cell rules, the prompts
```

Pure domain, no schema, no writes, and nothing on the page depends on a
source being connected. One of the tests asserts that no ported string
contains an em dash, which is her standing instruction and easy to
reintroduce by accident.
