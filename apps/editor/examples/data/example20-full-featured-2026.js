/* eslint-disable no-unused-vars */
/* eslint-disable no-var */
var fullFeatured2026Content = `# Demo

Inline math example: $\\sum_{i=0}^{\\infty} x^i + 35$ right in the text.
Inline math test: $\\sum_{i=0}^{\\infty} x^i$ should stay single backslashes.
Inline newline test: $a \\\\ b$ should render b under a (inline stacked layout).
Inline code (should NOT render): \`$\\sum$\`

\`\`\`
Code block (should NOT render): $\\sum$
\`\`\`

## Mermaid (flowchart)
\`\`\`mermaid
flowchart TD
  A[Client] --> B[LB]
  B --> C[Server1]
  B --> D[Server2]
\`\`\`

## Chart (official, preview)
\`\`\`chart
,category1,category2
Jan,21,23
Feb,31,17
Mar,26,35

type: column
title: Monthly Revenue
x.title: Month
y.title: Amount
y.min: 0
y.max: 40
y.suffix: $
\`\`\`

## UML (official, preview)
\`\`\`uml
Alice -> Bob: Hello
Bob --> Alice: Hi
\`\`\`

## Sequence (HedgeDoc-style)
\`\`\`sequence
Alice->Bob: Hello Bob, how are you?
Note right of Bob: Bob thinks
Bob-->Alice: I am good thanks!
Note left of Alice: Alice responds
Alice->Bob: Where have you been?
\`\`\`

## Flowchart (HedgeDoc-style)
\`\`\`flow
st=>start: Start
op=>operation: Work
cond=>condition: Done?
e=>end: End

st->op->cond
cond(yes)->e
cond(no)->op
\`\`\`

## Graphviz (HedgeDoc-style)
\`\`\`graphviz
digraph G {
  rankdir=LR;
  A -> B;
  B -> C;
  C -> A;
}
\`\`\`

## ABC Music Notation (HedgeDoc-style)
\`\`\`abc
X:1
T:Simple Scale
M:4/4
L:1/4
K:C
C D E F | G A B c |
\`\`\`

## LaTeX (block)
$$

\\begin{align*}
\\LaTeX\\\\
y = y(x,t) &= A e^{i\\theta} \\\\
&= A (\\cos \\theta + i \\sin \\theta) \\\\
&= A (\\cos(kx - \\omega t) + i \\sin(kx - \\omega t)) \\\\
&= A\\cos(kx - \\omega t) + i A\\sin(kx - \\omega t)  \\\\
&= A\\cos \\Big(\\frac{2\\pi}{\\lambda}x - \\frac{2\\pi v}{\\lambda} t \\Big)
   + i A\\sin \\Big(\\frac{2\\pi}{\\lambda}x - \\frac{2\\pi v}{\\lambda} t \\Big)  \\\\
&= A\\cos \\frac{2\\pi}{\\lambda} (x - v t)
   + i A\\sin \\frac{2\\pi}{\\lambda} (x - v t)
\\end{align*}
$$
`;
