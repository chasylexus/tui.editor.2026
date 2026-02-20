# TOAST UI Editor : UML Plugin

> This is a plugin of [TOAST UI Editor](https://github.com/nhn/tui.editor/tree/master/apps/editor) to render UML.

[![npm version](https://img.shields.io/npm/v/@techie_doubts/editor-plugin-uml.svg)](https://www.npmjs.com/package/@techie_doubts/editor-plugin-uml)

![uml](https://user-images.githubusercontent.com/37766175/121813437-01fe9b80-cca7-11eb-966b-598333c8ec14.png)

## 🚩 Table of Contents

- [Bundle File Structure](#-bundle-file-structure)
- [Usage npm](#-usage-npm)
- [Usage CDN](#-usage-cdn)

## 📁 Bundle File Structure

### Files Distributed on npm

```
- node_modules/
  - @techie_doubts/
    - editor-plugin-uml/
      - dist/
        - td-editor-plugin-uml.js
```

### Files Distributed on CDN

The bundle files include all dependencies of this plugin.

```
- uicdn.toast.com/
  - editor-plugin-uml/
    - latest/
      - td-editor-plugin-uml.js
      - td-editor-plugin-uml.min.js
```

## 📦 Usage npm

To use the plugin, [`@techie_doubts/tui.editor.2026`](https://github.com/nhn/tui.editor/tree/master/apps/editor) must be installed.

> Ref. [Getting Started](https://github.com/nhn/tui.editor/blob/master/docs/en/getting-started.md)

### Install

```sh
$ npm install @techie_doubts/editor-plugin-uml
```

### Import Plugin

#### ES Modules

```js
import uml from '@techie_doubts/editor-plugin-uml';
```

#### CommonJS

```js
const uml = require('@techie_doubts/editor-plugin-uml');
```

### Create Instance

#### Basic

```js
import Editor from '@techie_doubts/tui.editor.2026';
import uml from '@techie_doubts/editor-plugin-uml';

const editor = new Editor({
  // ...
  plugins: [uml]
});
```

#### With Viewer

```js
import Viewer from '@techie_doubts/tui.editor.2026/dist/toustui-editor-viewer';
import uml from '@techie_doubts/editor-plugin-uml';

const viewer = new Viewer({
  // ...
  plugins: [uml]
});
```

or

```js
import Editor from '@techie_doubts/tui.editor.2026';
import uml from '@techie_doubts/editor-plugin-uml';

const viewer = Editor.factory({
  // ...
  plugins: [uml],
  viewer: true
});
```

## 🗂 Usage CDN

To use the plugin, the CDN files(CSS, Script) of `@techie_doubts/tui.editor.2026` must be included.

### Include Files

```html
...
<body>
  ...
  <!-- Editor -->
  <script src="https://uicdn.toast.com/editor/latest/td-editor-all.min.js"></script>
  <!-- Editor's Plugin -->
  <script src="https://uicdn.toast.com/editor-plugin-uml/latest/td-editor-plugin-uml.min.js"></script>
  ...
</body>
...
```

### Create Instance

#### Basic

```js
const { Editor } = toastui;
const { uml } = Editor.plugin;

const editor = new Editor({
  // ...
  plugins: [uml]
});
```

#### With Viewer

```js
const Viewer = toastui.Editor;
const { uml } = Viewer.plugin;

const viewer = new Viewer({
  // ...
  plugins: [uml]
});
```

or

```js
const { Editor } = toastui;
const { uml } = Editor.plugin;

const viewer = Editor.factory({
  // ...
  plugins: [uml],
  viewer: true
});
```

### [Optional] Use Plugin with Options

The `uml` plugin can set options when used. Just add the plugin function and options related to the plugin to the array(`[pluginFn, pluginOptions]`) and push them to the `plugins` option of the editor.

The following option is available in the `uml` plugin.

| Name          | Type     | Default Value                             | Description               |
| ------------- | -------- | ----------------------------------------- | ------------------------- |
| `rendererURL` | `string` | `'http://www.plantuml.com/plantuml/png/'` | URL of plant uml renderer |

```js
// ...

import Editor from '@techie_doubts/tui.editor.2026';
import uml from '@techie_doubts/editor-plugin-uml';

const umlOptions = {
  rendererURL: // ...
};

const editor = new Editor({
  // ...
  plugins: [[uml, umlOptions]]
});
```
