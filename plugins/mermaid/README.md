# TOAST UI Editor : Mermaid Plugin

> This plugin adds Mermaid rendering for `$$mermaid ... $$` blocks.

## Install

```bash
npm install --save @toast-ui/editor-plugin-mermaid
```

## Usage

```js
import { Editor } from '@toast-ui/editor';
import mermaidPlugin from '@toast-ui/editor-plugin-mermaid';

const editor = new Editor({
  el: document.querySelector('#editor'),
  initialEditType: 'markdown',
  previewStyle: 'vertical',
  plugins: [mermaidPlugin],
});
```

## Notes

- Rendering is scheduled via `requestAnimationFrame` (Safari-friendly).
- The CDN build expects Mermaid to be loaded separately.
