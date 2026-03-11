import EventEmitter from '@/event/eventEmitter';
import { dropImage } from '@/plugins/dropImage';

jest.mock('@/helper/manipulation', () => {
  return {
    createTextSelection: jest.fn(() => 'selection'),
  };
});

describe('dropImage plugin', () => {
  it('should handle dropped media files and place cursor at drop position', () => {
    const eventEmitter = new EventEmitter();
    const emitSpy = jest.spyOn(eventEmitter, 'emit');
    const plugin = dropImage({ eventEmitter } as any);
    const dropHandler = plugin.props!.handleDOMEvents!.drop!;
    const tr = {
      doc: { content: { size: 128 } },
      setSelection: jest.fn().mockReturnThis(),
    } as any;
    const view = {
      state: { tr },
      dispatch: jest.fn(),
      posAtCoords: jest.fn(() => {
        return { pos: 12 };
      }),
    } as any;
    const imageFile = new File([new ArrayBuffer(1)], 'image.png', { type: 'image/png' });
    const audioFile = new File([new ArrayBuffer(1)], 'voice.m4a', { type: 'audio/mp4' });
    const videoFile = new File([new ArrayBuffer(1)], 'video.mp4', { type: 'video/mp4' });
    const textFile = new File([new ArrayBuffer(1)], 'text.txt', { type: 'text/plain' });
    const ev = {
      type: 'drop',
      clientX: 150,
      clientY: 240,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      dataTransfer: { files: [imageFile, audioFile, videoFile, textFile] },
    } as any;

    const handled = dropHandler.call(plugin, view, ev);

    expect(handled).toBe(true);
    expect(view.posAtCoords).toHaveBeenCalledWith({ left: 150, top: 240 });
    expect(tr.setSelection).toHaveBeenCalledTimes(1);
    expect(view.dispatch).toHaveBeenCalledTimes(1);
    expect(ev.preventDefault).toHaveBeenCalledTimes(1);
    expect(ev.stopPropagation).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(
      'addImageBlobHook',
      imageFile,
      expect.any(Function),
      'drop'
    );
    expect(emitSpy).toHaveBeenCalledWith(
      'addImageBlobHook',
      audioFile,
      expect.any(Function),
      'drop'
    );
    expect(emitSpy).toHaveBeenCalledWith(
      'addImageBlobHook',
      videoFile,
      expect.any(Function),
      'drop'
    );
    const emittedFiles = emitSpy.mock.calls
      .filter((args) => args[0] === 'addImageBlobHook')
      .map((args) => (args[1] as File).name);

    expect(emittedFiles).toEqual(['image.png', 'voice.m4a', 'video.mp4']);
  });

  it('should ignore dropped non-media files', () => {
    const eventEmitter = new EventEmitter();
    const emitSpy = jest.spyOn(eventEmitter, 'emit');
    const plugin = dropImage({ eventEmitter } as any);
    const dropHandler = plugin.props!.handleDOMEvents!.drop!;
    const tr = {
      doc: { content: { size: 128 } },
      setSelection: jest.fn().mockReturnThis(),
    } as any;
    const view = {
      state: { tr },
      dispatch: jest.fn(),
      posAtCoords: jest.fn(() => {
        return { pos: 5 };
      }),
    } as any;
    const textFile = new File([new ArrayBuffer(1)], 'text.txt', { type: 'text/plain' });
    const ev = {
      type: 'drop',
      clientX: 10,
      clientY: 10,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      dataTransfer: { files: [textFile] },
    } as any;

    const handled = dropHandler.call(plugin, view, ev);

    expect(handled).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(ev.stopPropagation).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalledWith(
      'addImageBlobHook',
      expect.anything(),
      expect.any(Function),
      'drop'
    );
  });

  it('should insert dropped audio/video by native local path when uri-list is provided', () => {
    const eventEmitter = new EventEmitter();
    const emitSpy = jest.spyOn(eventEmitter, 'emit');
    const plugin = dropImage({ eventEmitter } as any);
    const dropHandler = plugin.props!.handleDOMEvents!.drop!;
    const tr = {
      doc: { content: { size: 128 } },
      setSelection: jest.fn().mockReturnThis(),
    } as any;
    const view = {
      state: { tr },
      dispatch: jest.fn(),
      posAtCoords: jest.fn(() => {
        return { pos: 9 };
      }),
    } as any;
    const audioFile = new File([new ArrayBuffer(1)], 'voice.m4a', { type: 'audio/mp4' });
    const videoFile = new File([new ArrayBuffer(1)], 'clip.mp4', { type: 'video/mp4' });
    const ev = {
      type: 'drop',
      clientX: 30,
      clientY: 50,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      dataTransfer: {
        files: [audioFile, videoFile],
        getData: (type: string) => {
          if (type === 'text/uri-list') {
            return ['file:///Users/test/voice.m4a', 'file:///Users/test/clip.mp4'].join('\n');
          }

          return '';
        },
      },
    } as any;

    const handled = dropHandler.call(plugin, view, ev);

    expect(handled).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith('command', 'addImage', {
      imageUrl: '/Users/test/voice.m4a',
      altText: 'voice.m4a',
    });
    expect(emitSpy).toHaveBeenCalledWith('command', 'addImage', {
      imageUrl: '/Users/test/clip.mp4',
      altText: 'clip.mp4',
    });
    expect(emitSpy).not.toHaveBeenCalledWith(
      'addImageBlobHook',
      audioFile,
      expect.any(Function),
      'drop'
    );
    expect(emitSpy).not.toHaveBeenCalledWith(
      'addImageBlobHook',
      videoFile,
      expect.any(Function),
      'drop'
    );
  });
});
