/* eslint-disable no-unused-vars */
/* eslint-disable no-var */
var fullFeatured2026Content = `# Demo

## Local media path test (as requested)
These \`~/...\` paths are kept here for reproducibility.
When the editor is opened via \`http://127.0.0.1:8080\`, browsers do not allow direct reads from local disk paths.

![image](~/Downloads/AI-Agents-Crash-Course-RU-main/03/01_14.png)

![audio](~/Downloads/test_audio.m4a)

![youtube](https://www.youtube.com/watch?v=aqz-KE-bpKQ)

![youtube-sized](https://www.youtube.com/watch?v=aqz-KE-bpKQ =640x360)

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

## Scatter (marker color / callout demo)
\`\`\`chart
Item,X,Y
G,5,5
M,5,4.5
A,4.5,5
Y,4,4
S,3.5,4
O,3.5,3
K,3,2.5
V,3.5,3.6
T,3.5,3.3

type: scatter
title: Position
width: 700
height: 420
x.title: Scale A
y.title: Scale B
x.min: 0
x.max: 5.5
y.min: 0
y.max: 5.5
series.dataLabels.visible: true
series.dataLabels.formatter: "label"
theme.series.scatter.dataLabels.callout.lineWidth: 1.2
theme.series.scatter.dataLabels.callout.lineColor: "blue"
theme.series.colors: ["black"]
theme.series.scatter.fillColor: "yellow"
theme.series.scatter.borderWidth: 0.4
theme.series.scatter.size: 9
\`\`\`

## Radar (rows=features, columns=series)
\`\`\`chart
,Alpha,Beta,Gamma
Speed,4.2,3.5,4.8
Quality,4.7,3.9,4.3
Cost,2.1,3.8,2.9
Reliability,4.4,3.7,4.6
UX,4.6,3.8,4.1

type: radar
title: Capability Profile
width: 720
height: 440
series.showDot: true
series.showArea: true
plot.type: spiderweb
verticalAxis.scale.max: 5
theme.series.areaOpacity: 0.3
theme.series.dot.radius: 3
theme.series.dot.borderWidth: 1.2
theme.series.colors: ["#2563eb", "#f97316", "#16a34a"]
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
