import { oneLineTrim } from 'common-tags';
import Viewer from '@/viewer';
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

  it('should render inline recorder placeholder controls for record://audio sources', () => {
    viewer.setMarkdown('![voice note](record://audio?id=rec-12345)');

    const html = getViewerHTML();

    expect(html).toContain('class="toastui-inline-recorder"');
    expect(html).toContain('data-recorder-id="rec-12345"');
    expect(html).toContain('data-recorder-action="start"');
    expect(html).toContain('data-recorder-action="pause"');
    expect(html).toContain('data-recorder-action="stop"');
  });
});
