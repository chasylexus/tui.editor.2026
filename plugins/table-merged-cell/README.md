# TOAST UI Editor : Table Merged Cell Plugin

> This is a plugin of [TOAST UI Editor](https://github.com/nhn/tui.editor/tree/master/apps/editor) to merge table columns.

[![npm version](https://img.shields.io/npm/v/@techie_doubts/editor-plugin-table-merged-cell.svg)](https://www.npmjs.com/package/@techie_doubts/editor-plugin-table-merged-cell)

![table-merged-cell](https://user-images.githubusercontent.com/37766175/121814008-c0232480-cca9-11eb-8611-7ccc0fe8707f.png)

## 🚩 Table of Contents

- [Bundle File Structure](#-bundle-file-structure)
- [Usage npm](#-usage-npm)
- [Usage CDN](#-usage-cdn)

## 📁 Bundle File Structure

### Files Distributed on npm

```
- node_modules/
  - @techie_doubts/
    - editor-plugin-table-merged-cell/
      - dist/
        - td-editor-plugin-table-merged-cell.js
        - td-editor-plugin-table-merged-cell.css
```

### Files Distributed on CDN

The bundle files include all dependencies of this plugin.

```
- uicdn.toast.com/
  - editor-plugin-table-merged-cell/
    - latest/
      - td-editor-plugin-table-merged-cell.js
      - td-editor-plugin-table-merged-cell.min.js
      - td-editor-plugin-table-merged-cell.css
      - td-editor-plugin-table-merged-cell.min.css
```

## 📦 Usage npm

To use the plugin, [`@techie_doubts/tui.editor.2026`](https://github.com/nhn/tui.editor/tree/master/apps/editor) must be installed.

> Ref. [Getting Started](https://github.com/nhn/tui.editor/blob/master/docs/en/getting-started.md)

### Install

```sh
$ npm install @techie_doubts/editor-plugin-table-merged-cell
```

### Import Plugin

#### ES Modules

```js
import '@techie_doubts/editor-plugin-table-merged-cell/dist/td-editor-plugin-table-merged-cell.css';

import tableMergedCell from '@techie_doubts/editor-plugin-table-merged-cell';
```

#### CommonJS

```js
require('@techie_doubts/editor-plugin-table-merged-cell/dist/td-editor-plugin-table-merged-cell.css');

const tableMergedCell = require('@techie_doubts/editor-plugin-table-merged-cell');
```

### Create Instance

#### Basic

```js
import '@techie_doubts/editor-plugin-table-merged-cell/dist/td-editor-plugin-table-merged-cell.css';

import Editor from '@techie_doubts/tui.editor.2026';
import tableMergedCell from '@techie_doubts/editor-plugin-table-merged-cell';

const editor = new Editor({
  // ...
  plugins: [tableMergedCell]
});
```

#### With Viewer

```js
import '@techie_doubts/editor-plugin-table-merged-cell/dist/td-editor-plugin-table-merged-cell.css';

import Viewer from '@techie_doubts/tui.editor.2026/dist/td-editor-viewer';
import tableMergedCell from '@techie_doubts/editor-plugin-table-merged-cell';

const viewer = new Viewer({
  // ...
  plugins: [tableMergedCell]
});
```

or

```js
import '@techie_doubts/editor-plugin-table-merged-cell/dist/td-editor-plugin-table-merged-cell.css';

import Editor from '@techie_doubts/tui.editor.2026';
import tableMergedCell from '@techie_doubts/editor-plugin-table-merged-cell';

const viewer = Editor.factory({
  // ...
  plugins: [tableMergedCell],
  viewer: true
});
```

## 🗂 Usage CDN

To use the plugin, the CDN files(CSS, Script) of `@techie_doubts/tui.editor.2026` must be included.

### Include Files

```html
...
<head>
  ...
  <link
    rel="stylesheet"
    href="https://uicdn.toast.com/editor-plugin-table-merged-cell/latest/td-editor-plugin-table-merged-cell.min.css"
  />
  ...
</head>
<body>
  ...
  <!-- Editor -->
  <script src="https://uicdn.toast.com/editor/latest/td-editor-all.min.js"></script>
  <!-- Editor's Plugin -->
  <script src="https://uicdn.toast.com/editor-plugin-table-merged-cell/latest/td-editor-plugin-table-merged-cell.min.js"></script>
  ...
</body>
...
```

### Create Instance

#### Basic

```js
const { Editor } = toastui;
const { tableMergedCell } = Editor.plugin;

const editor = new Editor({
  // ...
  plugins: [tableMergedCell]
});
```

#### With Viewer

```js
const Viewer = toastui.Editor;
const { tableMergedCell } = Viewer.plugin;

const viewer = new Viewer({
  // ...
  plugins: [tableMergedCell]
});
```

or

```js
const { Editor } = toastui;
const { tableMergedCell } = Editor.plugin;

const viewer = Editor.factory({
  // ...
  plugins: [tableMergedCell],
  viewer: true
});
```
