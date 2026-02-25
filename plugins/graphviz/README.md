# TOAST UI Editor : Graphviz Plugin

> HedgeDoc-like Graphviz rendering for `\`\`\`graphviz` and `\`\`\`dot` fenced blocks.

## Install

```bash
npm install --save @techie_doubts/editor-plugin-graphviz
```

## Usage

```js
import { Editor } from '@techie_doubts/tui.editor.2026';
import graphvizPlugin from '@techie_doubts/editor-plugin-graphviz';

const editor = new Editor({
  el: document.querySelector('#editor'),
  plugins: [graphvizPlugin],
});
```
