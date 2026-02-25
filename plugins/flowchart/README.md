# TOAST UI Editor : Flowchart Plugin

> HedgeDoc-like flowchart rendering for `\`\`\`flow` and `\`\`\`flowchart` fenced blocks.

## Install

```bash
npm install --save @techie_doubts/editor-plugin-flowchart
```

## Usage

```js
import { Editor } from '@techie_doubts/tui.editor.2026';
import flowchartPlugin from '@techie_doubts/editor-plugin-flowchart';

const editor = new Editor({
  el: document.querySelector('#editor'),
  plugins: [flowchartPlugin],
});
```
