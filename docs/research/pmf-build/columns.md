# How the columns are chosen, and why they are not fixed

Researched September 2026. This file covers the mechanism the other three
share: the table's PARAMETERS are derived per business from the stages above
it, rather than shipped as a constant.

## Her instruction is the requirement

> "Feel free to add or remove the parameters I proposed to look at based on
> what you care about. E.g., do you not care about profit? Then don't look at
> the willingness to pay or pay strength, and just look at how many people
> are in that market."

So the column set is an output of the framework, not part of its definition.
A fixed table would contradict the document it implements.

## What the literature says about choosing criteria

The weighted-scoring literature is the only place that treats criterion
CHOICE as the decision. Its rules, condensed:

1. **Criteria reflect strategic objectives**, not a borrowed formula. The
   first step is identifying the criteria that actually drive the decision
   for this product and context.
2. **Four to six criteria.** Past that, scoring stops happening.
3. **Weights sum to 100%** when weights are used at all. At the number of rows
   a founder has here, weights are usually false precision - ordering by the
   two or three columns that matter beats a weighted total of six.
4. Fixed-formula frameworks (RICE, ICE) are the alternative, and they are
   right when the inputs exist. Customisation is for when they do not.

## The derivation, stage by stage

Each table's columns come from the answers ABOVE it. Nothing else.

| Table | Reads | Produces |
|---|---|---|
| Stage 2 segments | Stage 1: what it does, the user outcome, what YOU want, the six-month picture | Size always; pay-strength only if the goal mentions money; urgency almost always; reachability when there is no existing audience |
| Stage 3 pains | Stage 1 plus the chosen segment and its scores | Reach and severity always; frequency almost always; current cost when the goal is revenue; evidence when rows are guesses |
| Stage 4 solutions | Stage 1, the segment, and the chosen pains | Fit and effort always; which pain it solves always; confidence always; reach only if stage 2 produced a real size |

The signal that does the most work is the answer to **"what do YOU want out
of it"**. Her own example turns on it: an impact-first goal drops
pay-strength. A revenue-first goal keeps it and adds current spend to the
pain table.

## Rules the generator follows

- **Three to six columns.** Below three there is nothing to compare on; above
  six the table stops being filled in.
- **Her defaults survive unless a stated goal contradicts them.** Removing
  pay-strength needs the goal to say impact over revenue. Removing a column
  because it is hard to answer is not a reason.
- **Every column carries its scale and its anchors.** "Severity 1-10" without
  anchors is two people scoring three points apart.
- **A column must be answerable from what the founder can see this week.**
  Anything needing data they do not have belongs in the assumptions block, not
  as a column that will sit empty.
- **The first column names the row.** Every parameter in a weighted scoring
  matrix scores *something*, and the thing being scored is a column of its own
  -- the alternative in the decision matrix, the segment, the pain, the idea.
  A model asked for parameters returns parameters, so the generator states the
  naming column in the prompt and adds it back if it is missing. Adding it can
  push the set past six, in which case the weakest parameter goes: a lost
  parameter costs less than a table of scores with nothing to score.
- **The rows are prompts, not answers.** A generated row names a candidate the
  founder would recognise from their own stage-1 answers, with every cell a
  question. The framework's first rule is not suspended by the table format.
- **A cell has to fit its own control.** A `[to fill]` question belongs in a
  text cell. In a choice or scale cell it is unreadable -- the select has no
  such option, so the page would show a dash while the document said something
  else -- so those cells take a listed option, a number in range, or nothing.

## Sources

- [Weighted scoring model, step by step](https://productschool.com/blog/product-fundamentals/weighted-scoring-model)
- [Weighted scoring glossary](https://www.productplan.com/glossary/weighted-scoring)
- [Weighted decision matrix for product decisions](https://airfocus.com/blog/weighted-decision-matrix-prioritization/)
- [Scoring frameworks: ICE, RICE and weighted scoring](https://www.kaizenko.com/scoring-frameworks-ice-rice-and-weighted-scoring-for-product-prioritization/)
- [ICE, RICE and Kano compared](https://www.growthmentor.com/blog/prioritization-frameworks)
