export function detectEditorDarkClass(instance: any): boolean | null {
  if (typeof document === 'undefined') {
    return null;
  }

  let elements: any = null;

  try {
    elements = instance.getEditorElements?.();
  } catch (e) {
    elements = null;
  }

  const root =
    elements?.mdPreview?.closest('.toastui-editor-defaultUI') ||
    elements?.wwEditor?.closest('.toastui-editor-defaultUI') ||
    document.querySelector('.toastui-editor-defaultUI');

  if (!root) {
    return null;
  }

  return root.classList.contains('toastui-editor-dark');
}

export function resolveExportTheme(instance: any): 'dark' | 'default' {
  const darkFromDom = detectEditorDarkClass(instance);

  if (typeof darkFromDom === 'boolean') {
    return darkFromDom ? 'dark' : 'default';
  }

  try {
    return instance.getTheme?.() === 'dark' ? 'dark' : 'default';
  } catch (e) {
    return 'default';
  }
}
