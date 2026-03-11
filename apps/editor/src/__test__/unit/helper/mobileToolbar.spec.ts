import {
  clampMobileTextZoom,
  getMobileToolbarViewportOffset,
  getTouchDistance,
  isEditorContentTouchTarget,
  isMobileLikeDevice,
} from '@/helper/mobileToolbar';

describe('mobileToolbar helper', () => {
  it('treats coarse pointer devices as mobile-like', () => {
    expect(
      isMobileLikeDevice({
        matchMedia: () => {
          return { matches: true };
        },
        userAgent: 'Mozilla/5.0',
        maxTouchPoints: 0,
      })
    ).toBe(true);
  });

  it('treats iPad desktop user agents with touch points as mobile-like', () => {
    expect(
      isMobileLikeDevice({
        matchMedia: () => {
          return { matches: false };
        },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 5,
      })
    ).toBe(true);
  });

  it('keeps regular desktop devices out of mobile toolbar mode', () => {
    expect(
      isMobileLikeDevice({
        matchMedia: () => {
          return { matches: false };
        },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 0,
      })
    ).toBe(false);
  });

  it('computes the bottom offset from visual viewport geometry', () => {
    expect(
      getMobileToolbarViewportOffset({
        innerHeight: 900,
        documentClientHeight: 900,
        visualViewport: {
          height: 620,
          offsetTop: 180,
        },
      })
    ).toBe(100);
  });

  it('returns zero when the visual viewport fully matches the layout viewport', () => {
    expect(
      getMobileToolbarViewportOffset({
        innerHeight: 900,
        documentClientHeight: 900,
        visualViewport: {
          height: 900,
          offsetTop: 0,
        },
      })
    ).toBe(0);
  });

  it('clamps mobile text zoom to the supported range', () => {
    expect(clampMobileTextZoom(0.2)).toBe(0.8);
    expect(clampMobileTextZoom(1.3)).toBe(1.3);
    expect(clampMobileTextZoom(3)).toBe(2.4);
  });

  it('computes the distance between two touch points', () => {
    expect(getTouchDistance({ clientX: 10, clientY: 10 }, { clientX: 13, clientY: 14 })).toBe(5);
  });

  it('treats touches inside the editor main area as content touches, excluding the toolbar', () => {
    document.body.innerHTML = `
      <div class="toastui-editor-defaultUI">
        <div class="toastui-editor-toolbar">
          <button class="toolbar-button">B</button>
        </div>
        <div class="toastui-editor-main">
          <div class="toastui-editor-ww-container">
            <div class="toastui-editor-contents ProseMirror">
              <p><span class="content-node">Text</span></p>
            </div>
          </div>
        </div>
      </div>
    `;

    const toolbarButton = document.querySelector('.toolbar-button');
    const contentNode = document.querySelector('.content-node');

    expect(isEditorContentTouchTarget(toolbarButton)).toBe(false);
    expect(isEditorContentTouchTarget(contentNode)).toBe(true);
  });
});
