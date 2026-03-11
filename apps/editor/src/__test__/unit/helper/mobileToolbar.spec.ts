import { getMobileToolbarViewportOffset, isMobileLikeDevice } from '@/helper/mobileToolbar';

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
});
