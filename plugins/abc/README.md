# TOAST UI Editor : ABC Music Notation Plugin

> HedgeDoc-like ABC music notation rendering for `\`\`\`abc` fenced blocks.

## Install

```bash
npm install --save @techie_doubts/editor-plugin-abc
```

## Usage

```js
import { Editor } from '@techie_doubts/tui.editor.2026';
import abcPlugin from '@techie_doubts/editor-plugin-abc';

const editor = new Editor({
  el: document.querySelector('#editor'),
  plugins: [abcPlugin],
});
```
