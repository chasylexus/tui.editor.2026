import { Plugin } from 'prosemirror-state';
import { Context } from '@t/spec';
import { emitImageBlobHook, isMediaFile } from '@/helper/image';
import { createTextSelection } from '@/helper/manipulation';

type MediaFileType = 'image' | 'audio' | 'video' | 'other';

function getMediaFileType(file: File): MediaFileType {
  const type = String(file.type || '').toLowerCase();

  if (type.startsWith('image/')) {
    return 'image';
  }
  if (type.startsWith('audio/')) {
    return 'audio';
  }
  if (type.startsWith('video/')) {
    return 'video';
  }

  return 'other';
}

function normalizeLocalPath(rawPath: string) {
  const normalized = String(rawPath || '').trim();

  if (!normalized) {
    return '';
  }

  return normalized.replace(/\\/g, '/');
}

function decodeFileUriToPath(rawValue: string) {
  const value = String(rawValue || '').trim();

  if (!value || value.startsWith('#') || !/^file:\/\//i.test(value)) {
    return '';
  }

  try {
    const parsed = new URL(value);
    let decoded = decodeURIComponent(parsed.pathname || '');

    if (/^\/[A-Za-z]:\//.test(decoded)) {
      decoded = decoded.slice(1);
    }

    return normalizeLocalPath(decoded);
  } catch (_error) {
    return '';
  }
}

function extractDroppedLocalPaths(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer) {
    return [] as string[];
  }

  const getData =
    typeof dataTransfer.getData === 'function'
      ? (type: string) => dataTransfer.getData(type)
      : () => '';

  const candidates: string[] = [];
  const uriListRaw = getData('text/uri-list');
  const textRaw = getData('text/plain');

  if (uriListRaw) {
    candidates.push(...uriListRaw.split(/\r?\n/));
  }
  if (textRaw) {
    candidates.push(...textRaw.split(/\r?\n/));
  }

  const paths = candidates
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (/^file:\/\//i.test(line)) {
        return decodeFileUriToPath(line);
      }
      if (line.startsWith('/')) {
        return normalizeLocalPath(line);
      }

      return '';
    })
    .filter(Boolean);

  const unique = new Set<string>();
  const result: string[] = [];

  paths.forEach((path) => {
    if (!unique.has(path)) {
      unique.add(path);
      result.push(path);
    }
  });

  return result;
}

function getFileNativePath(file: File) {
  const fileLike = file as File & { path?: string; webkitRelativePath?: string };
  const nativePath =
    typeof fileLike.path === 'string' && fileLike.path.trim()
      ? fileLike.path
      : fileLike.webkitRelativePath || '';

  return normalizeLocalPath(nativePath);
}

function getBaseName(path: string) {
  const normalized = normalizeLocalPath(path);
  const segments = normalized.split('/').filter(Boolean);

  return segments.length ? segments[segments.length - 1].toLowerCase() : '';
}

export function dropImage({ eventEmitter }: Context) {
  return new Plugin({
    props: {
      handleDOMEvents: {
        drop: (view, ev) => {
          const dragEvent = ev as DragEvent;
          const items = dragEvent.dataTransfer?.files;
          let hasMedia = false;

          if (items) {
            const droppedPaths = extractDroppedLocalPaths(dragEvent.dataTransfer);
            const droppedPathsByName = droppedPaths.reduce<Record<string, string[]>>(
              (acc, path) => {
                const name = getBaseName(path);

                if (!name) {
                  return acc;
                }

                if (!acc[name]) {
                  acc[name] = [];
                }
                acc[name].push(path);

                return acc;
              },
              {}
            );

            const consumeDroppedPathForFile = (file: File) => {
              const nativePath = getFileNativePath(file);

              if (nativePath) {
                return nativePath;
              }

              const byName = droppedPathsByName[file.name.toLowerCase()];

              if (byName && byName.length) {
                return byName.shift() || '';
              }

              return '';
            };

            Array.from(items).forEach((item) => {
              if (isMediaFile(item)) {
                hasMedia = true;
              }
            });

            if (hasMedia) {
              const posAtDrop = view.posAtCoords({
                left: dragEvent.clientX,
                top: dragEvent.clientY,
              });

              if (posAtDrop) {
                const { tr } = view.state;

                view.dispatch(tr.setSelection(createTextSelection(tr, posAtDrop.pos)));
              }

              Array.from(items).forEach((item) => {
                if (isMediaFile(item)) {
                  const fileType = getMediaFileType(item);

                  if (fileType === 'audio' || fileType === 'video') {
                    const localPath = consumeDroppedPathForFile(item);

                    if (localPath) {
                      eventEmitter.emit('command', 'addImage', {
                        imageUrl: localPath,
                        altText: item.name || fileType,
                      });
                      return;
                    }
                  }

                  emitImageBlobHook(eventEmitter, item, ev.type);
                }
              });

              dragEvent.preventDefault();
              dragEvent.stopPropagation();
            }
          }

          return hasMedia;
        },
      },
    },
  });
}
