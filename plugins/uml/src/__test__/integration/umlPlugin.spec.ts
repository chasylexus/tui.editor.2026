/**
 * @fileoverview Test uml plugin
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
import Editor from '@toast-ui/editor';
import umlPlugin from '@/index';

function removeDataAttr(html: string) {
  return html
    .replace(/\sdata-nodeid="\d{1,}"/g, '')
    .replace(/\n/g, '')
    .trim();
}

describe('uml plugin', () => {
  let container: HTMLElement, editor: Editor;

  function assertWwEditorHTML(html: string) {
    const wwEditorEl = editor.getEditorElements().wwEditor;

    expect(wwEditorEl).toContainHTML(html);
  }

  function assertMdPreviewHTML(html: string) {
    const mdPreviewEl = editor.getEditorElements().mdPreview;

    expect(removeDataAttr(mdPreviewEl.innerHTML)).toContain(html);
  }

  beforeEach(() => {
    container = document.createElement('div');
    editor = new Editor({
      el: container,
      previewStyle: 'vertical',
      plugins: [umlPlugin],
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it('should render plant uml image in markdown preview', () => {
    const lang = 'uml';

    editor.setMarkdown(`$$${lang}\nAlice -> Bob: Hello\n$$`);

    assertMdPreviewHTML('src="//www.plantuml.com/plantuml/png');
  });

  it('should render plant uml image in markdown preview', () => {
    const lang = 'plantuml';

    editor.setMarkdown(`$$${lang}\nAlice -> Bob: Hello\n$$`);

    assertMdPreviewHTML('src="//www.plantuml.com/plantuml/png');
  });

  it('should render uml image in wysiwyg', () => {
    editor.setMarkdown('$$uml\nAlice -> Bob: Hello\n$$');
    editor.changeMode('wysiwyg');

    assertWwEditorHTML('src="//www.plantuml.com/plantuml/png');
  });

  it('should update uml image src when changeTheme event is emitted', async () => {
    editor.setMarkdown('$$uml\nAlice -> Bob: Hello\n$$');

    const mdPreviewEl = editor.getEditorElements().mdPreview;
    const img = mdPreviewEl.querySelector<HTMLImageElement>('img')!;
    const lightSrc = img.getAttribute('src');

    (editor as any).eventEmitter.emit('changeTheme', 'dark');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const darkSrc = img.getAttribute('src');

    expect(darkSrc).not.toBe(lightSrc);

    (editor as any).eventEmitter.emit('changeTheme', 'light');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const lightSrcAgain = img.getAttribute('src');

    expect(lightSrcAgain).toBe(lightSrc);
  });
});
