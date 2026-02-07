const undoReproContent = '# Heading\n\nThis is the initial paragraph text.';

function createLogger(editor, rootEl, name) {
  const getMode = () => (editor.isMarkdownMode() ? 'markdown' : 'wysiwyg');
  const getFocusInfo = () => {
    const active = document.activeElement;
    return {
      activeTag: active ? active.tagName : 'none',
      inEditor: rootEl.contains(active),
    };
  };
  const logState = (label) => {
    const md = editor.getMarkdown();
    const focus = getFocusInfo();
    // eslint-disable-next-line no-console
    console.log(`[${name}] ${label}`, {
      mode: getMode(),
      markdownLength: md.length,
      activeElement: focus.activeTag,
      focusInEditor: focus.inEditor,
    });
  };

  let lastUndoKeyAt = 0;
  window.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
      lastUndoKeyAt = Date.now();
      logState('undo keydown');
    }
  });

  return {
    onChange() {
      const now = Date.now();
      if (now - lastUndoKeyAt < 300) {
        logState('undo dispatch');
        lastUndoKeyAt = 0;
      } else {
        logState('change');
      }
    },
    onFocus() {
      logState('focus');
    },
    onBlur() {
      logState('blur');
    },
    onKeydown() {
      logState('keydown');
    },
  };
}

(function () {
  const { Editor } = toastui;

  const editorAEl = document.getElementById('editor-a');
  const editorBEl = document.getElementById('editor-b');

  const editorA = new Editor({
    el: editorAEl,
    height: '300px',
    initialValue: undoReproContent,
    initialEditType: 'markdown',
    previewStyle: 'vertical',
    useCommandShortcut: true,
  });
  const editorB = new Editor({
    el: editorBEl,
    height: '300px',
    initialValue: undoReproContent,
    initialEditType: 'markdown',
    previewStyle: 'vertical',
    useCommandShortcut: false,
  });

  const loggerA = createLogger(editorA, editorAEl, 'EditorA');
  const loggerB = createLogger(editorB, editorBEl, 'EditorB');

  editorA.on('change', loggerA.onChange);
  editorA.on('focus', loggerA.onFocus);
  editorA.on('blur', loggerA.onBlur);
  editorA.on('keydown', loggerA.onKeydown);

  editorB.on('change', loggerB.onChange);
  editorB.on('focus', loggerB.onFocus);
  editorB.on('blur', loggerB.onBlur);
  editorB.on('keydown', loggerB.onKeydown);

  const outsideButton = document.getElementById('outside-button');
  outsideButton.addEventListener('click', () => {
    outsideButton.focus();
    // eslint-disable-next-line no-console
    console.log('[outside] clicked', document.activeElement && document.activeElement.tagName);
  });
})();
/* eslint-disable no-unused-vars */
/* eslint-disable no-var */
var undoReproContent = `# Undo Repro

This is a paragraph with some text.
Second line to ensure multiple blocks.
`;
