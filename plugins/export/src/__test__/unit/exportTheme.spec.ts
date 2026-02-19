import { resolveExportTheme } from '@/theme';

describe('resolveExportTheme', () => {
  function createInstanceWithRoot({ dark, getTheme }: { dark: boolean; getTheme?: () => string }) {
    const root = document.createElement('div');
    const mdPreview = document.createElement('div');

    root.className = `toastui-editor-defaultUI${dark ? ' toastui-editor-dark' : ''}`;
    root.appendChild(mdPreview);
    document.body.appendChild(root);

    return {
      instance: {
        getTheme,
        getEditorElements() {
          return { mdPreview, wwEditor: null };
        },
      },
      cleanup() {
        root.remove();
      },
    };
  }

  it('should prefer dark theme from editor root class over getTheme()', () => {
    const { instance, cleanup } = createInstanceWithRoot({
      dark: true,
      getTheme: () => 'light',
    });

    expect(resolveExportTheme(instance)).toBe('dark');

    cleanup();
  });

  it('should prefer light theme from editor root class over getTheme()', () => {
    const { instance, cleanup } = createInstanceWithRoot({
      dark: false,
      getTheme: () => 'dark',
    });

    expect(resolveExportTheme(instance)).toBe('default');

    cleanup();
  });

  it('should fallback to getTheme() when editor root is unavailable', () => {
    const instance = {
      getTheme: () => 'dark',
      getEditorElements() {
        return null;
      },
    };

    expect(resolveExportTheme(instance)).toBe('dark');
  });

  it('should safely fallback to default when unavailable', () => {
    const instance = {
      getTheme() {
        throw new Error('not ready');
      },
      getEditorElements() {
        throw new Error('not mounted');
      },
    };

    expect(resolveExportTheme(instance)).toBe('default');
  });
});
