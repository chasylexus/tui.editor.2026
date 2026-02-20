# TOAST UI Editor : Export Plugin

> This plugin adds toolbar buttons to download Markdown and standalone HTML.

## Install

```bash
npm install --save @techie_doubts/editor-plugin-export
```

## Usage

```js
import { Editor } from '@techie_doubts/tui.editor.2026';
import exportPlugin from '@techie_doubts/editor-plugin-export';

const editor = new Editor({
  el: document.querySelector('#editor'),
  initialEditType: 'markdown',
  previewStyle: 'vertical',
  plugins: [exportPlugin],
});
```

## Notes

- HTML export embeds CSS and inlines images/canvases for standalone output.
