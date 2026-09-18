# Stage 3 - Problem: what to consider, and how to score it

Researched September 2026. Sources at the bottom.

## What her doc already fixes

Write the CURRENT journey in tiny steps first, then mark pains along it and
score them. Pick one to three. Her warning: watch for a bigger pain hiding
somewhere else in the journey than the one you assumed - which is the reason
the journey comes before the scoring rather than after.

**"Current" means without your product in it.** The journey is how the person
reaches the outcome today, using whatever they use now - and the pains are in
that journey. A generated table that anchors its pains to steps inside the
product's own interface ("when they open the app", "when they hit the free
tier limit") has quietly swapped the question for usability feedback on
something that may not need to exist. It is also the exact failure her warning
names: a pain outside your product is invisible to a journey drawn inside it.

| Column in the doc | Scale |
|---|---|
| Pain point (where in the journey) | text |
| Number of users who have it | S / M / L |
| Severity | 1-10 |
| Competition already solving it | Y / N |

## What the literature adds

**Severity alone ranks badly; severity times frequency is the unit.** A
severe but rare problem can rank below a moderate but near-universal one.
Frequency is the column her doc is missing, and it is the one that changes
the order most often.

**Four dimensions recur:** intensity (how badly it hurts), frequency (how
often), reach (how many), and willingness to pay (what they already spend on
it). Her doc has intensity and reach; frequency and current spend are the
additions.

**Willingness to pay is evidenced, not asked.** The strong signal is whether
people have already paid for an imperfect solution - existing budget proves
the problem is expensive enough to justify a paid fix. That turns a vague
"would you pay" into a checkable question: what do they use today and what
does it cost them.

**High frequency plus high intensity is the premium quadrant.** Pains that
are both are where people accept premium pricing; that pair is the thing to
look for, rather than the single highest severity score.

**Scales are small on purpose.** Published rubrics use 1-5 for severity with
anchors (1 = rare edge case, 3 = a meaningful segment hits it regularly,
5 = most customers hit it). Her 1-10 works, but only with anchors written
down, or two people score the same pain three points apart.

**The cost has to be expressible.** The repeated validation instruction: the
pain must be expensive enough in time, money or frustration to justify
someone paying. If it cannot be stated in one of those three units, it is
not a scoreable pain.

## Candidate columns, with when each earns its place

| Column | Scale | Earns its place when |
|---|---|---|
| Where in the journey | text | Always. It ties the pain to the step above it. |
| How many have it | S / M / L | Always. Her default. |
| Severity | 1-10 with anchors | Always. Her default, plus anchors. |
| Frequency | daily / weekly / monthly / rarely | Almost always - it reorders the list more than any other column. |
| What it costs them today | text: time, money or frustration | When the goal is revenue, or when pricing is an open question. |
| Already solved by competition | Y / N, plus well or badly | Always. Her default, sharpened. |
| Evidence | text | When any row is a guess - it makes the guess visible rather than letting a scored table look researched. |

## What this does NOT settle

- Nothing gives a rule for how many journey steps is enough. Her "tiny steps"
  is the only guidance, and the generated prompt should ask for the journey in
  the user's own voice rather than a tidy summary.
- Severity anchors are domain-specific. The prompt should write anchors for
  THIS product rather than reuse a generic 1-5 ladder.

## Sources

- [Pain point prioritization: a scoring framework](https://www.smaply.com/blog/pain-point-prioritization)
- [Pain point matrix for product validation](https://painonsocial.com/blog/pain-point-matrix-strategic-framework)
- [Pain point analysis framework](https://painonsocial.com/blog/pain-point-analysis-framework)
- [Pain point metrics: measuring problems that matter](https://painonsocial.com/blog/pain-point-metrics)
- [Analyzing pain intensity and frequency](https://www.revanthquicklearn.com/post/08-analyzing-pain-intensity-and-frequency)
