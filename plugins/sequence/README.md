# TOAST UI Editor : Sequence Diagram Plugin

> This plugin adds HedgeDoc-like sequence diagram rendering for `$$sequence ... $$` and `\`\`\`sequence` fenced blocks.

## Install

```bash
npm install --save @techie_doubts/editor-plugin-sequence
```

## Usage

```js
import { Editor } from '@techie_doubts/tui.editor.2026';
import sequencePlugin from '@techie_doubts/editor-plugin-sequence';

const editor = new Editor({
  el: document.querySelector('#editor'),
  initialEditType: 'markdown',
  previewStyle: 'vertical',
  plugins: [sequencePlugin],
});
```
