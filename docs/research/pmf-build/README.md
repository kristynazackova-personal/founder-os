# Research behind the build framework's generated forms

Her Product Framework doc says WHAT to fill in and, for three stages, gives a
table with suggested columns. It deliberately does not say how to judge an
entry, and it explicitly invites changing the columns:

> "This framework shouldn't be rigid. Look at the concept, and feel free to
> add or remove the parameters I proposed to look at based on what you care
> about. E.g., do you not care about profit? Then don't look at the
> willingness to pay or pay strength, and just look at how many people are in
> that market."

That invitation is the whole reason the generated tables pick their own
columns per business rather than shipping a fixed set. This folder is the
research behind those choices: one file per stage, each stating what the
literature says to consider, what it says about scoring it, and what it does
NOT settle.

`src/lib/domain/pmfPrompts.ts` is generated FROM these files - the prompts are
the operational form of what is written here. Change the research first, then
the prompt, so the reasoning never goes missing.

| File | Stage | What it covers |
|---|---|---|
| `segment.md` | 2 - Target user | Segmentation and beachhead criteria, what makes a segment scoreable |
| `problem.md` | 3 - Problem | Pain scoring: severity, frequency, reach, willingness to pay |
| `solutions.md` | 4 - Solutions | RICE, ICE, value/effort, and why her L/M/H is usually right at this size |
| `columns.md` | all three | How the column set is chosen from the answers above it |

## The standing rule

Everything here describes how to frame a question. None of it licenses the
tool to answer one. The framework's first rule stands: the ideas are the
founder's, and a generated row is a prompt with its columns filled in as
questions, never a claim about a market the tool has not seen.
