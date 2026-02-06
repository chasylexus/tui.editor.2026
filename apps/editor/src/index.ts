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
