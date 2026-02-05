# TOAST UI Editor : Export Plugin

> This plugin adds toolbar buttons to download Markdown and standalone HTML.

## Install

```bash
npm install --save @toast-ui/editor-plugin-export
```

## Usage

```js
import { Editor } from '@toast-ui/editor';
import exportPlugin from '@toast-ui/editor-plugin-export';

const editor = new Editor({
  el: document.querySelector('#editor'),
  initialEditType: 'markdown',
  previewStyle: 'vertical',
  plugins: [exportPlugin],
});
```

## Notes

- HTML export embeds CSS and inlines images/canvases for standalone output.
