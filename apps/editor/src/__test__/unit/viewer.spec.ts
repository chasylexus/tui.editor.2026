import { oneLineTrim } from 'common-tags';
import Viewer from '@/viewer';
import { createDrawioViewerUrl } from '@/utils/media';
import { createHTMLrenderer, removeDataAttr } from './markdown/util';

describe('Viewer', () => {
  let viewer: Viewer, container: HTMLElement;

  function getViewerHTML() {
    return oneLineTrim`${removeDataAttr(
      container.querySelector('.toastui-editor-contents')!.innerHTML
    )}`;
  }

  beforeEach(() => {
    container = document.createElement('div');

    viewer = new Viewer({
      el: container,
      extendedAutolinks: true,
      frontMatter: true,
      initialValue: '# test\n* list1\n* list2',
      customHTMLRenderer: createHTMLrenderer(),
    });

    document.body.appendChild(container);
  });

  afterEach(() => {
    viewer.destroy();
    document.body.removeChild(container);
  });

  it('should render properly', () => {
    const expected = oneLineTrim`
      <h1>test</h1>
      <ul>
        <li>
          <p>list1</p>
        </li>
        <li>
          <p>list2</p>
        </li>
      </ul>
    `;

    expect(getViewerHTML()).toBe(expected);
  });

  it('should update preview by setMarkdown API', () => {
    viewer.setMarkdown('> block quote\n# heading *emph*');

    const expected = oneLineTrim`
      <blockquote><p>block quote</p></blockquote>
      <h1>
        heading <em>emph</em>
      </h1>
    `;

    expect(getViewerHTML()).toBe(expected);
  });

  it('should render htmlBlock properly', () => {
    viewer.setMarkdown(
      '<iframe src="https://www.youtube.com/embed/XyenY12fzAk" height="315" width="420"></iframe>'
    );

    const expected =
      '<iframe width="420" height="315" src="https://www.youtube.com/embed/XyenY12fzAk"></iframe>';

    expect(getViewerHTML()).toBe(expected);
  });

  it('should render markdown image with youtube url as embedded iframe', () => {
    viewer.setMarkdown('![youtube](https://www.youtube.com/watch?v=aqz-KE-bpKQ =560x315)');

    const html = getViewerHTML();

    expect(html).toContain('class="toastui-media toastui-media-video-host"');
    expect(html).toContain('src="https://www.youtube.com/embed/aqz-KE-bpKQ"');
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('width="560"');
    expect(html).toContain('height="315"');
  });

  it('should keep normal image markdown rendering unchanged', () => {
    viewer.setMarkdown('![img](https://octodex.github.com/images/minion.png)');

    const html = getViewerHTML();

    expect(html).toContain('<img');
    expect(html).toContain('src="https://octodex.github.com/images/minion.png"');
  });

  it('should render markdown image with audio file url as audio player', () => {
    viewer.setMarkdown('![audio](https://example.com/test.m4a)');

    const html = getViewerHTML();

    expect(html).toContain('<audio');
    expect(html).toContain('class="toastui-media toastui-media-audio"');
    expect(html).toContain('src="https://example.com/test.m4a"');
    expect(html).toContain('controls=""');
  });

  it('should render markdown image with video file url as video player', () => {
    viewer.setMarkdown('![video](https://example.com/test.mp4 =640x360)');

    const html = getViewerHTML();

    expect(html).toContain('<video');
    expect(html).toContain('class="toastui-media toastui-media-video-file"');
    expect(html).toContain('src="https://example.com/test.mp4"');
    expect(html).toContain('width="640"');
    expect(html).toContain('height="360"');
  });

  it('should render markdown image with draw.io file url as embedded viewer iframe', () => {
    viewer.setMarkdown('![diagram](https://example.com/architecture.drawio =720x480)');

    const html = getViewerHTML();

    expect(html).toContain('<iframe');
    expect(html).toContain('class="toastui-media toastui-media-drawio"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups"');
    expect(html).toContain('src="https://viewer.diagrams.net/');
    expect(html).toContain(
      'style="display:block;width:100%;background:transparent;max-width:720px;aspect-ratio:720 / 480;height:auto"'
    );
    expect(html).toContain('#Uhttps%3A%2F%2Fexample.com%2Farchitecture.drawio');
    expect(html).toContain('width="720"');
    expect(html).toContain('height="480"');
  });

  it('should generate same-origin draw.io viewer url through the local viewer page', () => {
    const viewerUrl = createDrawioViewerUrl(
      'http://localhost/__local_media?path=~%2FDownloads%2Fdemo.drawio',
      'diagram'
    );

    expect(viewerUrl).toContain('http://localhost/dist/cdn/td-drawio-viewer.html?');
    expect(viewerUrl).toContain(
      'src=http%3A%2F%2Flocalhost%2F__local_media%3Fpath%3D%7E%252FDownloads%252Fdemo.drawio'
    );
  });

  it('should render inline recorder placeholder controls for record://audio sources', () => {
    viewer.setMarkdown('![voice note](record://audio?id=rec-12345)');

    const html = getViewerHTML();

    expect(html).toContain('class="toastui-inline-recorder"');
    expect(html).toContain('data-recorder-id="rec-12345"');
    expect(html).toContain('data-recorder-action="start"');
    expect(html).toContain('data-recorder-action="stop"');
  });
});
