# Stage rules (V1: stages 0 to 3)

The placement is deterministic. `src/lib/domain/stages.ts` (`placeStage`) is the
only implementation; the founder sees the reasons it returns on the diagnosis
screen ("Why you're here"). Stages 4 and 5 arrive with V2.

## Inputs

All from `computeMetrics` (`src/lib/domain/metrics.ts`), which runs over the
normalised revenue data of every connected source (Stripe, Lemon Squeezy,
Paddle) merged with live wrapped-checkout activity, plus funnel signals from the
snippet (or GA4 when the snippet is not installed).

| Metric | Definition |
|---|---|
| Paying customers | distinct customers with an active, non-trial subscription **plus** distinct one-time buyers in the last 30 days who are not subscribers |
| MRR | sum of active subscriptions normalised to a month (yearly ÷ 12, weekly × 52 ÷ 12), converted to USD with the coarse table in `money.ts` |
| MoM growth | (MRR now − MRR 30 days ago) ÷ MRR 30 days ago; `null` when there was no MRR 30 days ago |
| Churn 30d | customers active 30 days ago who are not active now ÷ customers active 30 days ago; `null` when nobody was active |
| Days since launch | from the launch date the founder set, else the earliest charge or subscription |
| Days of data | from the source's data window, else the earliest charge or subscription |

Test-mode purchases never count. Refunded charges never count.

**Report-derived sources (App Store) infer lapses.** Apple's reports only
say what happened; nothing says "this one quietly stopped renewing". So a
subscription is treated as lapsed (status `canceled`, `canceledAt` = the
inferred expiry) once its last paid event is older than one billing period
plus Apple's 16-day billing-retry grace, and an unconverted free trial once
its offer length (the plan period when the report doesn't carry it) plus the
same grace has passed. Stripe's own statuses are authoritative and are not
second-guessed. A free trial ("Start introductory offer" at 0.00) is never a
paying customer until a paid event follows.

| Metric | Definition |
|---|---|
| Free trials | distinct customers currently on a trial |
| Trial starts 30d / trial → paid | trials started in the window, and the share of them that has reached a paid period so far (recent starts haven't had time) |
| Lapsed 30d | distinct customers whose subscription ended, cancelled or inferred, in the window |

## Placement

Evaluated top-down; the first rule that matches wins.

| Stage | Name | Rule |
|---|---|---|
| 3 | Traction | paying customers ≥ 11 **or** MRR ≥ $500 |
| 2 | First dollars | paying customers ≥ 1 |
| 1 | Priced | a way to pay exists: an active live plan on wrapped checkout, or the connected payment account has active prices / any subscription |
| 0 | Built | none of the above |

A Stripe-connected founder with paying customers is stage 2 or 3 even if we
cannot see their checkout - customers beat everything.

## Confidence

| Confidence | When |
|---|---|
| high | a revenue source is connected and there are ≥ 30 days of data |
| medium | a revenue source is connected but < 30 days of data (growth and churn are not meaningful yet) |
| low | no revenue source; the placement rests on what the founder told us |

An extra note is added at stage 2+ when there is no signup data, because
conversion cannot be computed.

## The three numbers and the one action

`diagnose()` in the same file. Per stage:

| Stage | Three numbers | Action |
|---|---|---|
| 0 | days since launch · visitors 30d · signups 30d | run the pricing interview, or turn on checkout if pricing exists |
| 1 | checkout views 30d · signups 30d · days since launch | install the snippet, else ask the ten most active users to pay |
| 2 | paying customers · MRR · checkout → paid | talk to every paying customer this week |
| 3 | MRR · MoM growth · churn 30d | churn > 8% → fix churn first; else double down on the channel that pays |

The sentence is templated from the numbers so the founder reads their own
figures, e.g. "You're at $1,400 MRR, growing 9%, churn 11% - fix churn first".

## Peer bands

`src/lib/domain/benchmarks.ts`. Peer medians are shown only when a stage cell
has **n ≥ 50** apps with medium or high confidence (`PEER_BAND_MIN_N`); below
that, static public benchmarks are shown and labelled as such.
