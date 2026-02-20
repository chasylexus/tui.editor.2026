interface ColorPickerOption {
  container: HTMLElement;
  preset?: string[];
}

declare module '@techie_doubts/tui.color-picker.2026' {
  interface ColorPicker {
    getColor(): string;
    slider: {
      toggle(type: boolean): void;
    };
  }

  function create(options: ColorPickerOption): ColorPicker;
}
