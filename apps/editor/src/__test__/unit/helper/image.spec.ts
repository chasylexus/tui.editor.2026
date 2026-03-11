import EventEmitter from '@/event/eventEmitter';
import {
  addDefaultImageBlobHook,
  emitImageBlobHook,
  hasMeaningfulClipboardText,
  pasteImageOnly,
} from '@/helper/image';

describe('image processor', () => {
  let em: EventEmitter;

  beforeEach(() => {
    em = new EventEmitter();
  });

  function mockReadAsDataURL() {
    jest
      .spyOn(FileReader.prototype, 'readAsDataURL')
      .mockImplementation(function (this: FileReader) {
        const ev = { target: { result: '/file.jpg' } } as ProgressEvent<FileReader>;

        this.onload!(ev);
      });
  }

  it('should call addImageBlobHook hook on calling emitImageBlobHook function', () => {
    const spy = jest.fn();
    const file = new File([new ArrayBuffer(1)], 'file.jpg');

    em.listen('addImageBlobHook', spy);
    emitImageBlobHook(em, file, 'drop');

    expect(spy).toHaveBeenCalledWith(file, expect.any(Function), 'drop');
  });

  it('should execute addImage command through hook callback function in default addImageBlobHook hook', () => {
    addDefaultImageBlobHook(em);
    mockReadAsDataURL();

    const spy = jest.fn();
    const file = new File([new ArrayBuffer(1)], 'file.jpg');

    em.listen('command', spy);
    emitImageBlobHook(em, file, 'drop');

    expect(spy).toHaveBeenCalledWith('addImage', { altText: 'file.jpg', imageUrl: '/file.jpg' });
  });

  it('should use data URL for non-image files in default addImageBlobHook hook', () => {
    addDefaultImageBlobHook(em);
    mockReadAsDataURL();

    const spy = jest.fn();
    const file = new File([new ArrayBuffer(1)], 'audio.m4a', { type: 'audio/mp4' });

    em.listen('command', spy);
    emitImageBlobHook(em, file, 'drop');

    expect(spy).toHaveBeenCalledWith('addImage', {
      altText: 'audio.m4a',
      imageUrl: '/file.jpg',
    });
  });

  it('should prefer text clipboard data over image fallback when html contains meaningful content', () => {
    const imageItem = {
      type: 'image/png',
      getAsFile: jest.fn(() => new File([new ArrayBuffer(1)], 'slide.png', { type: 'image/png' })),
    };
    const items = ([imageItem] as unknown) as DataTransferItemList;
    const clipboardData = ({
      getData: jest.fn((type: string) => {
        if (type === 'text/html') {
          return '<div><p>Slide title</p><p>Bullet</p></div>';
        }

        if (type === 'text/plain') {
          return 'Slide title\nBullet';
        }

        return '';
      }),
    } as unknown) as DataTransfer;

    expect(hasMeaningfulClipboardText(clipboardData)).toBe(true);
    expect(pasteImageOnly(items, clipboardData)).toBeNull();
  });

  it('should still use image fallback when clipboard has only image data', () => {
    const file = new File([new ArrayBuffer(1)], 'slide.png', { type: 'image/png' });
    const imageItem = {
      type: 'image/png',
      getAsFile: jest.fn(() => file),
    };
    const items = ([imageItem] as unknown) as DataTransferItemList;
    const clipboardData = ({
      getData: jest.fn(() => ''),
    } as unknown) as DataTransfer;

    expect(hasMeaningfulClipboardText(clipboardData)).toBe(false);
    expect(pasteImageOnly(items, clipboardData)).toBe(file);
  });
});
