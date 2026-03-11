interface MatchMediaResult {
  matches: boolean;
}

interface MobileDeviceDetectionSource {
  matchMedia?: (query: string) => MatchMediaResult;
  userAgent?: string;
  maxTouchPoints?: number;
}

interface VisualViewportLike {
  height?: number;
  offsetTop?: number;
}

interface MobileViewportMetricsSource {
  innerHeight?: number;
  documentClientHeight?: number;
  visualViewport?: VisualViewportLike | null;
}

export function isMobileLikeDevice(source?: MobileDeviceDetectionSource) {
  const matchMediaFn =
    source?.matchMedia ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : null);
  const coarsePointer = Boolean(matchMediaFn?.('(pointer: coarse)').matches);
  const userAgent =
    source?.userAgent ??
    (typeof navigator === 'object' && typeof navigator.userAgent === 'string'
      ? navigator.userAgent
      : '');
  const maxTouchPoints =
    source?.maxTouchPoints ??
    (typeof navigator === 'object' ? Number(navigator.maxTouchPoints || 0) : 0);
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    userAgent
  );
  const ipadDesktopUserAgent = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;

  return coarsePointer || mobileUserAgent || ipadDesktopUserAgent;
}

export function getMobileToolbarViewportOffset(source?: MobileViewportMetricsSource) {
  const layoutViewportHeight = Math.max(
    Number(source?.innerHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 0) ?? 0),
    Number(
      source?.documentClientHeight ??
        (typeof document !== 'undefined' ? document.documentElement?.clientHeight : 0) ??
        0
    )
  );
  const viewportHeight = Number(
    source?.visualViewport?.height ??
      (typeof window !== 'undefined' ? window.visualViewport?.height : 0) ??
      layoutViewportHeight
  );
  const viewportOffsetTop = Number(
    source?.visualViewport?.offsetTop ??
      (typeof window !== 'undefined' ? window.visualViewport?.offsetTop : 0) ??
      0
  );
  const currentVisibleBottom = Math.max(0, viewportHeight + Math.max(0, viewportOffsetTop));

  return Math.max(0, Math.round(layoutViewportHeight - currentVisibleBottom));
}
