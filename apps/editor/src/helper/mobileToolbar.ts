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

export const MOBILE_TEXT_ZOOM_MIN = 0.8;

export const MOBILE_TEXT_ZOOM_MAX = 2.4;

export const MOBILE_TEXT_ZOOM_DEFAULT = 1;

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

export function clampMobileTextZoom(value: number) {
  return Math.min(Math.max(value, MOBILE_TEXT_ZOOM_MIN), MOBILE_TEXT_ZOOM_MAX);
}

interface PointLike {
  clientX: number;
  clientY: number;
}

export function getTouchDistance(touchA: PointLike, touchB: PointLike) {
  const deltaX = Number(touchA.clientX) - Number(touchB.clientX);
  const deltaY = Number(touchA.clientY) - Number(touchB.clientY);

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

export function isEditorContentTouchTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest('.toastui-editor-toolbar')) {
    return false;
  }

  return Boolean(target.closest('.toastui-editor-main'));
}
