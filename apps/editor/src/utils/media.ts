const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac', 'opus', 'weba'];
const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv'];
const DRAWIO_EXTENSIONS = ['drawio', 'dio', 'drawio.xml'];

export const INLINE_RECORDER_SCHEME = 'record://audio';
export const DRAWIO_VIEWER_ORIGIN = 'https://viewer.diagrams.net';
export const DRAWIO_LOCAL_VIEWER_PATH = '/dist/cdn/td-drawio-viewer.html';

function absolutizeUrl(rawValue: string) {
  const value = String(rawValue || '').trim();

  if (!value) {
    return value;
  }

  try {
    return new URL(value).toString();
  } catch (_error) {
    if (typeof window !== 'undefined' && window.location) {
      try {
        return new URL(value, window.location.href).toString();
      } catch (_innerError) {
        return value;
      }
    }

    return value;
  }
}

function isSameOriginUrl(rawValue: string) {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  try {
    const url = new URL(rawValue, window.location.href);

    return url.origin === window.location.origin;
  } catch (_error) {
    return false;
  }
}

interface ParsedEmbedVideo {
  provider: 'youtube' | 'vimeo' | 'rutube' | 'dailymotion';
  embedUrl: string;
}

function getLowerPathWithoutQuery(raw: string) {
  const value = String(raw || '').trim();

  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);

    return url.pathname.toLowerCase();
  } catch (_error) {
    return value.split(/[?#]/, 1)[0].toLowerCase();
  }
}

function hasExtension(raw: string, candidates: string[]) {
  const path = getLowerPathWithoutQuery(raw);

  if (!path) {
    return false;
  }

  return candidates.some((ext) => path.endsWith(`.${ext}`));
}

function parseTimeTokenToSeconds(token: string | null) {
  if (!token) {
    return null;
  }

  const value = token.trim();

  if (!value) {
    return null;
  }

  if (/^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  let seconds = 0;
  let matched = false;
  const re = /(\d+)(h|m|s)/g;

  let result = re.exec(value);

  while (result) {
    matched = true;

    const [, amountText, unit] = result;
    const amount = Number.parseInt(amountText, 10);

    if (Number.isFinite(amount)) {
      if (unit === 'h') {
        seconds += amount * 3600;
      } else if (unit === 'm') {
        seconds += amount * 60;
      } else {
        seconds += amount;
      }
    }

    result = re.exec(value);
  }

  return matched && seconds >= 0 ? seconds : null;
}

export function parseVideoEmbedUrl(rawValue: string): ParsedEmbedVideo | null {
  let url: URL;

  try {
    url = new URL(String(rawValue || '').trim());
  } catch (_error) {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = url.pathname || '/';

  if (
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    let videoId = '';
    let startAt: number | null = null;

    if (host === 'youtu.be') {
      videoId = pathname.split('/').filter(Boolean)[0] || '';
      startAt = parseTimeTokenToSeconds(url.searchParams.get('t'));
    } else if (pathname.startsWith('/watch')) {
      videoId = url.searchParams.get('v') || '';
      startAt = parseTimeTokenToSeconds(url.searchParams.get('t'));
    } else {
      const parts = pathname.split('/').filter(Boolean);

      if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
        videoId = parts[1] || '';
      }

      startAt = parseTimeTokenToSeconds(url.searchParams.get('t'));
    }

    if (!videoId) {
      return null;
    }

    const params = new URLSearchParams();

    if (startAt) {
      params.set('start', String(startAt));
    }

    return {
      provider: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${videoId}${
        params.toString() ? `?${params.toString()}` : ''
      }`,
    };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = pathname.match(/\/(?:video\/)?(\d+)/);

    if (!match) {
      return null;
    }

    return {
      provider: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${match[1]}`,
    };
  }

  if (host === 'rutube.ru') {
    const match = pathname.match(/\/video\/([a-zA-Z0-9_-]+)/);

    if (!match) {
      return null;
    }

    return {
      provider: 'rutube',
      embedUrl: `https://rutube.ru/play/embed/${match[1]}`,
    };
  }

  if (host === 'dailymotion.com' || host === 'dai.ly') {
    const id =
      host === 'dai.ly'
        ? pathname.split('/').filter(Boolean)[0] || ''
        : pathname.match(/\/video\/([a-zA-Z0-9]+)/)?.[1] || '';

    if (!id) {
      return null;
    }

    return {
      provider: 'dailymotion',
      embedUrl: `https://www.dailymotion.com/embed/video/${id}`,
    };
  }

  return null;
}

export function isAudioReference(rawValue: string) {
  const value = String(rawValue || '').trim();

  if (!value) {
    return false;
  }

  if (/^data:audio\//i.test(value)) {
    return true;
  }

  return hasExtension(value, AUDIO_EXTENSIONS);
}

export function isVideoFileReference(rawValue: string) {
  const value = String(rawValue || '').trim();

  if (!value) {
    return false;
  }

  if (/^data:video\//i.test(value)) {
    return true;
  }

  return hasExtension(value, VIDEO_EXTENSIONS);
}

export function isDrawioReference(rawValue: string) {
  const value = String(rawValue || '').trim();

  if (!value) {
    return false;
  }

  return hasExtension(value, DRAWIO_EXTENSIONS);
}

export function createDrawioViewerUrl(drawioUrl: string, title: string) {
  const normalizedUrl = absolutizeUrl(drawioUrl);

  if (isSameOriginUrl(normalizedUrl) && typeof window !== 'undefined' && window.location) {
    const viewerUrl = new URL(DRAWIO_LOCAL_VIEWER_PATH, window.location.href);

    viewerUrl.searchParams.set('src', normalizedUrl);
    viewerUrl.searchParams.set('title', String(title || 'draw.io'));

    return viewerUrl.toString();
  }

  const params = new URLSearchParams({
    highlight: '#4f8cff',
    edit: '_blank',
    layers: '1',
    nav: '1',
    dark: 'auto',
    title: String(title || 'draw.io'),
  });

  return `${DRAWIO_VIEWER_ORIGIN}/?${params.toString()}#U${encodeURIComponent(normalizedUrl)}`;
}

export function createDrawioResponsiveStyle(
  width: number | null | undefined,
  height: number | null | undefined
) {
  const styleParts = ['display:block', 'width:100%', 'background:transparent'];

  if (typeof width === 'number' && width > 0) {
    styleParts.push(`max-width:${width}px`);
  }

  if (typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0) {
    styleParts.push(`aspect-ratio:${width} / ${height}`);
    styleParts.push('height:auto');
  } else if (typeof height === 'number' && height > 0) {
    styleParts.push(`height:${height}px`);
  }

  return styleParts.join(';');
}

export function createInlineRecorderSource(recorderId: string) {
  const normalizedId = String(recorderId || '').trim();

  if (!normalizedId) {
    return INLINE_RECORDER_SCHEME;
  }

  return `${INLINE_RECORDER_SCHEME}?id=${encodeURIComponent(normalizedId)}`;
}

export function parseInlineRecorderSource(rawValue: string): { id: string } | null {
  const value = String(rawValue || '').trim();

  if (!value.toLowerCase().startsWith(INLINE_RECORDER_SCHEME)) {
    return null;
  }

  try {
    const url = new URL(value);
    const id = String(url.searchParams.get('id') || '').trim();

    if (!id) {
      return null;
    }

    return { id };
  } catch (_error) {
    const query = value.split('?', 2)[1] || '';
    const params = new URLSearchParams(query);
    const id = String(params.get('id') || '').trim();

    if (!id) {
      return null;
    }

    return { id };
  }
}
