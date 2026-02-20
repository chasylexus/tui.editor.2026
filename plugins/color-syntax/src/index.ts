import ColorPicker from 'tui-color-picker';
import type { Context } from '@toast-ui/toastmark';
import type { PluginContext, PluginInfo, HTMLMdNode, I18n } from '@toast-ui/editor';
import type { Selection } from 'prosemirror-state';
import { PluginOptions } from '@t/index';
import { addLangs } from './i18n/langs';

import './css/plugin.css';
import { findParentByClassName } from './utils/dom';

const PREFIX = 'toastui-editor-';

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function parseStyleString(style: string): Record<string, string> {
  const result: Record<string, string> = {};

  if (!style) {
    return result;
  }

  style.split(';').forEach((part) => {
    const colon = part.indexOf(':');

    if (colon > 0) {
      const key = part.slice(0, colon).trim();
      const val = part.slice(colon + 1).trim();

      if (key && val) {
        result[key] = val;
      }
    }
  });

  return result;
}

function buildStyleString(styles: Record<string, string>): string {
  return Object.keys(styles)
    .map((k) => `${k}: ${styles[k]}`)
    .join('; ');
}

function getExistingSpanStyle(selection: Selection, schema: any): string {
  const { $from } = selection;
  const spanType = schema.marks.span;

  if (!spanType) {
    return '';
  }

  if (!selection.empty) {
    const { from, to } = selection;
    let style = '';

    $from.doc.nodesBetween(from, to, (node: any) => {
      if (style || !node.isText) {
        return;
      }

      const m = spanType.isInSet(node.marks);

      if (m) {
        style = (m.attrs.htmlAttrs && m.attrs.htmlAttrs.style) || '';
      }
    });

    return style;
  }

  const mark = spanType.isInSet($from.marks());

  if (mark) {
    return (mark.attrs.htmlAttrs && mark.attrs.htmlAttrs.style) || '';
  }

  if ($from.nodeBefore) {
    const m = spanType.isInSet($from.nodeBefore.marks);

    if (m) {
      return (m.attrs.htmlAttrs && m.attrs.htmlAttrs.style) || '';
    }
  }

  return '';
}

// ---------------------------------------------------------------------------
// Markdown helpers: detect and rewrite existing <span style="..."> wrappers
// ---------------------------------------------------------------------------

const RE_SPAN_WRAP = /^<span\s+style="([^"]*)">([\s\S]*)<\/span>$/i;

function parseMdSpanStyle(text: string): { inner: string; styles: Record<string, string> } | null {
  const m = RE_SPAN_WRAP.exec(text);

  if (!m) {
    return null;
  }

  return { inner: m[2], styles: parseStyleString(m[1]) };
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function createApplyButton(text: string) {
  const button = document.createElement('button');

  button.setAttribute('type', 'button');
  button.textContent = text;

  return button;
}

function getCurrentEditorEl(el: HTMLElement, containerCls: string) {
  const root = findParentByClassName(el, `${PREFIX}defaultUI`)!;

  return root.querySelector<HTMLElement>(`.${containerCls} .ProseMirror`)!;
}

function createColorPicker(preset: string[] | undefined, usageStatistics: boolean, i18n: I18n) {
  const container = document.createElement('div');
  const option: { container: HTMLDivElement; preset?: string[]; usageStatistics: boolean } = {
    container,
    usageStatistics,
  };

  if (preset) {
    option.preset = preset;
  }

  const picker = ColorPicker.create(option);
  const button = createApplyButton(i18n.get('OK'));

  picker.slider.toggle(true);
  container.appendChild(button);

  return { container, picker, button };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

let containerClassName: string;
let currentEditorEl: HTMLElement;

/**
 * Color syntax plugin with text color and background color toolbar buttons.
 */
export default function colorSyntaxPlugin(
  context: PluginContext,
  options: PluginOptions = {}
): PluginInfo {
  const { eventEmitter, i18n, usageStatistics = true, pmState } = context;
  const { preset } = options;

  addLangs(i18n);

  // --- text color picker (original) --------------------------------------

  const textPicker = createColorPicker(preset, usageStatistics, i18n);

  // --- background color picker (new) -------------------------------------

  const bgPicker = createColorPicker(preset, usageStatistics, i18n);

  // --- focus tracking ----------------------------------------------------

  eventEmitter.listen('focus', (editType) => {
    containerClassName = `${PREFIX}${editType === 'markdown' ? 'md' : 'ww'}-container`;
  });

  // --- text color OK click -----------------------------------------------

  textPicker.container.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).getAttribute('type') === 'button') {
      const hexInput = textPicker.container.querySelector<HTMLInputElement>(
        '.tui-colorpicker-palette-hex'
      );
      const selectedColor = hexInput ? hexInput.value.trim() : textPicker.picker.getColor();

      currentEditorEl = getCurrentEditorEl(textPicker.container, containerClassName);
      currentEditorEl.focus();
      eventEmitter.emit('command', 'color', { selectedColor });
      eventEmitter.emit('closePopup');
    }
  });

  // --- background color OK click -----------------------------------------

  bgPicker.container.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).getAttribute('type') === 'button') {
      const hexInput = bgPicker.container.querySelector<HTMLInputElement>(
        '.tui-colorpicker-palette-hex'
      );
      const selectedColor = hexInput ? hexInput.value.trim() : bgPicker.picker.getColor();

      currentEditorEl = getCurrentEditorEl(bgPicker.container, containerClassName);
      currentEditorEl.focus();
      eventEmitter.emit('command', 'bgColor', { selectedColor });
      eventEmitter.emit('closePopup');
    }
  });

  // --- toolbar items -----------------------------------------------------

  const textToolbarItem = {
    name: 'color',
    tooltip: i18n.get('Text color'),
    className: `${PREFIX}toolbar-icons color`,
    popup: {
      className: `${PREFIX}popup-color`,
      body: textPicker.container,
      style: { width: 'auto' },
    },
  };

  const bgToolbarItem = {
    name: 'bgColor',
    tooltip: i18n.get('Background color'),
    className: `${PREFIX}toolbar-icons bgcolor`,
    text: 'BG',
    popup: {
      className: `${PREFIX}popup-color`,
      body: bgPicker.container,
      style: { width: 'auto' },
    },
  };

  // --- commands -----------------------------------------------------------

  return {
    markdownCommands: {
      color: (payload, { tr, selection, schema }, dispatch) => {
        const { selectedColor } = payload || {};

        if (typeof selectedColor === 'undefined') {
          return false;
        }

        const slice = selection.content();
        const rawText = slice.content.textBetween(0, slice.content.size, '\n');
        const parsed = parseMdSpanStyle(rawText);
        const existing = parsed ? parsed.styles : {};
        const inner = parsed ? parsed.inner : rawText;

        if (selectedColor) {
          existing.color = selectedColor;
        } else {
          delete existing.color;
        }

        const styleStr = buildStyleString(existing);

        if (styleStr) {
          const fullText = `<span style="${styleStr}">${inner}</span>`;

          tr.replaceSelectionWith(schema.text(fullText));

          const start = tr.mapping.map(selection.from);

          tr.setSelection(pmState.TextSelection.create(tr.doc, start, start + fullText.length));
        } else if (inner) {
          tr.replaceSelectionWith(schema.text(inner));
        }

        dispatch!(tr);

        return true;
      },
      bgColor: (payload, { tr, selection, schema }, dispatch) => {
        const { selectedColor } = payload || {};

        if (typeof selectedColor === 'undefined') {
          return false;
        }

        const slice = selection.content();
        const rawText = slice.content.textBetween(0, slice.content.size, '\n');
        const parsed = parseMdSpanStyle(rawText);
        const existing = parsed ? parsed.styles : {};
        const inner = parsed ? parsed.inner : rawText;

        if (selectedColor) {
          existing.background = selectedColor;
        } else {
          delete existing.background;
        }

        const styleStr = buildStyleString(existing);

        if (styleStr) {
          const fullText = `<span style="${styleStr}">${inner}</span>`;

          tr.replaceSelectionWith(schema.text(fullText));

          const start = tr.mapping.map(selection.from);

          tr.setSelection(pmState.TextSelection.create(tr.doc, start, start + fullText.length));
        } else if (inner) {
          tr.replaceSelectionWith(schema.text(inner));
        }

        dispatch!(tr);

        return true;
      },
    },
    wysiwygCommands: {
      color: (payload, { tr, selection, schema }, dispatch) => {
        const { selectedColor } = payload || {};

        if (typeof selectedColor === 'undefined') {
          return false;
        }

        const { from, to } = selection;
        const existingStyle = getExistingSpanStyle(selection, schema);
        const existing = parseStyleString(existingStyle);

        if (selectedColor) {
          existing.color = selectedColor;
        } else {
          delete existing.color;
        }

        const styleStr = buildStyleString(existing);

        if (styleStr) {
          const attrs = { htmlAttrs: { style: styleStr } };

          tr.addMark(from, to, schema.marks.span.create(attrs));
        } else {
          tr.removeMark(from, to, schema.marks.span);
        }

        tr.setSelection(pmState.TextSelection.create(tr.doc, from, to));
        dispatch!(tr);

        return true;
      },
      bgColor: (payload, { tr, selection, schema }, dispatch) => {
        const { selectedColor } = payload || {};

        if (typeof selectedColor === 'undefined') {
          return false;
        }

        const { from, to } = selection;
        const existingStyle = getExistingSpanStyle(selection, schema);
        const existing = parseStyleString(existingStyle);

        if (selectedColor) {
          existing.background = selectedColor;
        } else {
          delete existing.background;
        }

        const styleStr = buildStyleString(existing);

        if (styleStr) {
          const attrs = { htmlAttrs: { style: styleStr } };

          tr.addMark(from, to, schema.marks.span.create(attrs));
        } else {
          tr.removeMark(from, to, schema.marks.span);
        }

        tr.setSelection(pmState.TextSelection.create(tr.doc, from, to));
        dispatch!(tr);

        return true;
      },
    },
    toolbarItems: [
      {
        groupIndex: 0,
        itemIndex: 3,
        item: textToolbarItem,
      },
      {
        groupIndex: 0,
        itemIndex: 4,
        item: bgToolbarItem,
      },
    ],
    toHTMLRenderers: {
      htmlInline: {
        span(node: HTMLMdNode, { entering }: Context) {
          return entering
            ? { type: 'openTag', tagName: 'span', attributes: node.attrs! }
            : { type: 'closeTag', tagName: 'span' };
        },
      },
    },
  };
}
