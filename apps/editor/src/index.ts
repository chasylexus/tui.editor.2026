if (typeof window !== 'undefined') {
  const urlDebug = new URLSearchParams(window.location.search).get('snapshotDebug') === '1';

  if (urlDebug) {
    window.localStorage.setItem('TOASTUI_SNAPSHOT_DEBUG', '1');
  }

  const storageDebug = window.localStorage.getItem('TOASTUI_SNAPSHOT_DEBUG') === '1';
  const win = window as any;

  win.__TOASTUI_SNAPSHOT_DEBUG__ = win.__TOASTUI_SNAPSHOT_DEBUG__ ?? (urlDebug || storageDebug);
  win.__TOASTUI_SNAPSHOT_DEBUG_MARKER__ = 'snapshot-debug-present';
}

import EditorCore from './editorCore';
import Editor from './editor';
import { themeIcons } from './ui/icons/themeIcons';

import 'prosemirror-view/style/prosemirror.css';
import '@/css/editor.css';
import '@/css/contents.css';
import '@/css/preview-highlighting.css';
import '@/css/md-syntax-highlighting.css';

import './i18n/en-us';

// Expose theme icons for example integrations.
(Editor as any).themeIcons = themeIcons;

export default Editor;
export { Editor, EditorCore, themeIcons };
