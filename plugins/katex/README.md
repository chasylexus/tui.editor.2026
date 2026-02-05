# TOAST UI Editor : KaTeX Plugin

> This plugin adds KaTeX rendering for `$$latex ... $$` blocks and inline `$...$` math.

## Install

```bash
npm install --save @toast-ui/editor-plugin-katex
```

## Usage

```js
import { Editor } from '@toast-ui/editor';
import katexPlugin from '@toast-ui/editor-plugin-katex';

const editor = new Editor({
  el: document.querySelector('#editor'),
  initialEditType: 'markdown',
  previewStyle: 'vertical',
  plugins: [katexPlugin],
});
```

## Notes

- Inline rendering in WYSIWYG uses decoration overlays only (no nodeviews or document mutation).
- KaTeX stylesheet is required for proper rendering.
