import { buildStandaloneHtml } from '@/index';

describe('buildStandaloneHtml', () => {
  it('should reset editor container height and overflow for standalone export scrolling', () => {
    const html = buildStandaloneHtml('<p>test</p>', false);

    expect(html).toContain('.toastui-editor-contents');
    expect(html).toContain('overflow-y: auto !important;');
    expect(html).toContain('overflow-y: visible !important;');
    expect(html).toContain('.ProseMirror');
    expect(html).toContain('max-height: none !important;');
  });

  it('should include standalone youtube fallback for file protocol exports', () => {
    const html = buildStandaloneHtml(
      '<iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ" width="560" height="315"></iframe>',
      false
    );

    expect(html).toContain('data-toastui-youtube-fallback');
    expect(html).toContain("window.location.protocol !== 'file:'");
    expect(html).toContain('i.ytimg.com/vi/');
    expect(html).toContain('youtube.com/watch?v=');
  });
});
