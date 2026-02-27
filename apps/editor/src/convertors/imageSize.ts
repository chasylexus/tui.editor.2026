export interface ImageSizeInfo {
  width: number | null;
  height: number | null;
  spec: string;
}

const reImageSizeSpec = /^=(\d*)x(\d*)$/i;

function parsePositiveInt(value: string) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function parseImageSizeSpec(value: string | null | undefined): ImageSizeInfo | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const matched = reImageSizeSpec.exec(trimmed);

  if (!matched) {
    return null;
  }

  const width = parsePositiveInt(matched[1]);
  const height = parsePositiveInt(matched[2]);

  if (width === null && height === null) {
    return null;
  }

  return {
    width,
    height,
    spec: `=${width ?? ''}x${height ?? ''}`,
  };
}

export function formatImageSizeSpec(
  width: number | null | undefined,
  height: number | null | undefined
) {
  const normalizedWidth = typeof width === 'number' && width > 0 ? Math.trunc(width) : null;
  const normalizedHeight = typeof height === 'number' && height > 0 ? Math.trunc(height) : null;

  if (normalizedWidth === null && normalizedHeight === null) {
    return '';
  }

  return `=${normalizedWidth ?? ''}x${normalizedHeight ?? ''}`;
}

export function parseImageDimensionInput(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}
