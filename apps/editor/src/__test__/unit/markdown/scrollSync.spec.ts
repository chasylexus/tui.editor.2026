import EventEmitter from '@/event/eventEmitter';
import { ScrollSync } from '@/markdown/scroll/scrollSync';
import * as scrollDom from '@/markdown/scroll/dom';

function setDimension(el: Element, key: string, value: number) {
  Object.defineProperty(el, key, {
    configurable: true,
    writable: true,
    value,
  });
}

function createScrollSync(markdown: string) {
  const previewRoot = document.createElement('div');
  const previewEl = document.createElement('div');
  const editorDom = document.createElement('div');
  const lineCount = 20;

  for (let idx = 0; idx < lineCount; idx += 1) {
    const line = document.createElement('div');

    setDimension(line, 'offsetTop', idx * 50);
    setDimension(line, 'clientHeight', 50);
    editorDom.appendChild(line);
  }

  setDimension(editorDom, 'scrollTop', 200);
  setDimension(editorDom, 'scrollHeight', 1000);
  setDimension(editorDom, 'clientHeight', 500);

  setDimension(previewEl, 'scrollTop', 0);
  setDimension(previewEl, 'scrollHeight', 2000);
  setDimension(previewEl, 'clientHeight', 500);

  const toastMark = {
    getLineTexts: () => Array(lineCount).fill('line'),
    findNodeAtPosition: jest.fn(() => ({ id: 999 })),
    findFirstNodeAtLine: jest.fn(() => ({ id: 999 })),
  };
  const editorView = {
    dom: editorDom,
    state: {
      doc: {
        childCount: lineCount,
        content: {
          findIndex: jest.fn(() => ({ index: 0 })),
        },
      },
    },
    posAtCoords: jest.fn(() => ({ pos: 1, inside: 0 })),
  };
  const mdEditor = {
    view: editorView,
    getToastMark: () => toastMark,
    getSelection: () => [[1, 1], [1, 1]],
    getMarkdown: () => markdown,
  };
  const preview = {
    previewContent: previewRoot,
    el: previewEl,
  };

  return {
    scrollSync: new ScrollSync(mdEditor as any, preview as any, new EventEmitter()),
  };
}

describe('ScrollSync', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should fallback to ratio mapping for editor->preview when footnotes exist and node mapping is missing', () => {
    const { scrollSync } = createScrollSync('Footnote ref[^a].\n\n[^a]: Footnote text.');
    const runSpy = jest.spyOn(scrollSync as any, 'run').mockImplementation(() => {});
    const mapSpy = jest
      .spyOn(scrollSync as any, 'getPreviewScrollTopByFootnoteLineMap')
      .mockReturnValue(null);

    (scrollSync as any).syncPreviewScrollTop(false);

    expect(mapSpy).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalledWith('editor', 600, 0);
  });

  it('should keep mapped footnote line sync when footnotes mapping is available', () => {
    const { scrollSync } = createScrollSync('Footnote ref[^a].\n\n[^a]: Footnote text.');
    const runSpy = jest.spyOn(scrollSync as any, 'run').mockImplementation(() => {});
    const mapSpy = jest
      .spyOn(scrollSync as any, 'getPreviewScrollTopByFootnoteLineMap')
      .mockReturnValue(777);

    (scrollSync as any).syncPreviewScrollTop(false);

    expect(mapSpy).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalledWith('editor', 777, 0);
  });

  it('should not throw when parent preview node mapping is missing during caret-based sync', () => {
    const { scrollSync } = createScrollSync('line 1\nline 2');

    jest.spyOn(scrollDom, 'getParentNodeObj').mockReturnValue({
      mdNode: null,
      el: null,
    } as any);

    expect(() => {
      (scrollSync as any).syncPreviewScrollTop(true);
    }).not.toThrow();
  });
});
