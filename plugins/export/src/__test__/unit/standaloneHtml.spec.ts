import { buildStandaloneHtml, inlineCanvases, inlineEmbeddedDiagramSnapshots } from '@/index';

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

  it('should replace drawio and excalidraw iframes with inline svg snapshots and hidden source payload', async () => {
    document.body.innerHTML = `
      <div id="original">
        <iframe class="toastui-media toastui-media-drawio" src="http://localhost/dist/cdn/td-drawio-viewer.html?src=http%3A%2F%2Flocalhost%2F__local_media%3Fpath%3Ddemo.drawio" width="720"></iframe>
        <iframe class="toastui-media toastui-media-excalidraw" src="http://localhost/dist/cdn/td-excalidraw-viewer.html?src=http%3A%2F%2Flocalhost%2F__local_media%3Fpath%3Dscene.excalidraw" width="680"></iframe>
      </div>
      <div id="clone">
        <iframe class="toastui-media toastui-media-drawio" src="http://localhost/dist/cdn/td-drawio-viewer.html?src=http%3A%2F%2Flocalhost%2F__local_media%3Fpath%3Ddemo.drawio" width="720"></iframe>
        <iframe class="toastui-media toastui-media-excalidraw" src="http://localhost/dist/cdn/td-excalidraw-viewer.html?src=http%3A%2F%2Flocalhost%2F__local_media%3Fpath%3Dscene.excalidraw" width="680"></iframe>
      </div>
    `;

    const original = document.getElementById('original') as HTMLElement;
    const clone = document.getElementById('clone') as HTMLElement;
    const originalIframes = Array.from(original.querySelectorAll('iframe'));

    originalIframes.forEach((iframe, index) => {
      const doc = document.implementation.createHTMLDocument(`frame-${index}`);

      doc.body.innerHTML = `<svg viewBox="0 0 100 50"><rect width="100" height="50"/></svg>`;
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        value: doc,
      });
    });

    const fetchMock = jest.fn((url: string) =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(`source:${url}`),
      })
    );
    const fetchImpl = (fetchMock as unknown) as typeof fetch;

    await inlineEmbeddedDiagramSnapshots(original, clone, fetchImpl);

    expect(clone.querySelectorAll('iframe')).toHaveLength(0);
    expect(clone.querySelectorAll('.toastui-export-diagram')).toHaveLength(2);
    expect(clone.querySelectorAll('.toastui-export-diagram > svg')).toHaveLength(2);
    expect(clone.querySelectorAll('script[data-toastui-export-source]')).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(clone.innerHTML).toContain('toastui-export-diagram-drawio');
    expect(clone.innerHTML).toContain('toastui-export-diagram-excalidraw');
  });

  it('should inline canvas snapshots with responsive width and preserved aspect ratio', () => {
    document.body.innerHTML = `
      <div id="original">
        <canvas></canvas>
      </div>
      <div id="clone">
        <canvas></canvas>
      </div>
    `;

    const original = document.getElementById('original') as HTMLElement;
    const clone = document.getElementById('clone') as HTMLElement;
    const sourceCanvas = original.querySelector('canvas') as HTMLCanvasElement;

    Object.defineProperty(sourceCanvas, 'width', { configurable: true, value: 1200 });
    Object.defineProperty(sourceCanvas, 'height', { configurable: true, value: 700 });
    sourceCanvas.style.width = '600px';
    sourceCanvas.style.height = '350px';
    sourceCanvas.toDataURL = jest.fn(() => 'data:image/png;base64,AAA');
    jest.spyOn(sourceCanvas, 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 350,
      top: 0,
      left: 0,
      right: 600,
      bottom: 350,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    } as DOMRect);

    inlineCanvases(original, clone);

    const image = clone.querySelector('img') as HTMLImageElement;

    expect(image).toBeTruthy();
    expect(image.getAttribute('width')).toBe('1200');
    expect(image.getAttribute('height')).toBe('700');
    expect(image.style.width).toBe('100%');
    expect(image.style.height).toBe('auto');
    expect(image.style.maxWidth).toBe('600px');
  });
});
