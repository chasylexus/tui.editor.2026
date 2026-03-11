import { EditorOptions, ViewerOptions } from '@t/editor';
import { DefaultUI, VNode, IndexList, ToolbarItemOptions } from '@t/ui';
import EditorCore from './editorCore';
import Viewer from './viewer';
import html from './ui/vdom/template';
import { Layout } from './ui/components/layout';
import { render } from './ui/vdom/renderer';
import {
  clampMobileTextZoom,
  getMobileToolbarViewportOffset,
  getTouchDistance,
  isEditorContentTouchTarget,
  isMobileLikeDevice,
  MOBILE_TEXT_ZOOM_DEFAULT,
} from './helper/mobileToolbar';

/**
 * ToastUI Editor
 * @extends ToastUIEditorCore
 */
class ToastUIEditor extends EditorCore {
  private defaultUI!: DefaultUI;

  private layout!: Layout;

  private mobileViewportSyncTimer: number | null = null;

  private mobileViewportSyncFrame: number | null = null;

  private currentMobileTextZoom = MOBILE_TEXT_ZOOM_DEFAULT;

  private pinchZoomSession: {
    startDistance: number;
    startZoom: number;
  } | null = null;

  constructor(options: EditorOptions) {
    super(options);

    let layoutComp!: Layout;
    const destroy = render(
      this.options.el,
      html`
        <${Layout}
          ref=${(layout: Layout) => (layoutComp = layout)}
          eventEmitter=${this.eventEmitter}
          slots=${this.getEditorElements()}
          hideModeSwitch=${this.options.hideModeSwitch}
          toolbarItems=${this.options.toolbarItems}
          previewStyle=${this.options.previewStyle}
          editorType=${this.options.initialEditType}
          theme=${this.options.theme}
        />
      ` as VNode
    );

    this.layout = layoutComp;

    this.setMinHeight(this.options.minHeight);
    this.setHeight(this.options.height);
    this.defaultUI = {
      insertToolbarItem: layoutComp.insertToolbarItem.bind(layoutComp),
      removeToolbarItem: layoutComp.removeToolbarItem.bind(layoutComp),
      destroy,
    };

    this.pluginInfo.toolbarItems?.forEach((toolbarItem) => {
      const { groupIndex, itemIndex, item } = toolbarItem;

      this.defaultUI.insertToolbarItem({ groupIndex, itemIndex }, item);
    });
    this.eventEmitter.emit('loadUI', this);
    this.initMobileToolbarLayout();
  }

  /**
   * Factory method for Editor
   * @param {object} options Option for initialize TUIEditor
   * @returns {object} ToastUIEditor or ToastUIEditorViewer
   */
  static factory(options: (EditorOptions | ViewerOptions) & { viewer?: boolean }) {
    return options.viewer ? new Viewer(options) : new ToastUIEditor(options as EditorOptions);
  }

  /**
   * add toolbar item
   * @param {Object} indexInfo group index and item index of the toolbar item
   * @param {string|Object} item toolbar item
   */
  insertToolbarItem(indexInfo: IndexList, item: string | ToolbarItemOptions) {
    this.defaultUI.insertToolbarItem(indexInfo, item);
  }

  /**
   * Remove toolbar item
   * @param {string} itemName toolbar item name
   */
  removeToolbarItem(itemName: string) {
    this.defaultUI.removeToolbarItem(itemName);
  }

  /**
   * Destroy TUIEditor from document
   */
  destroy() {
    this.destroyMobileToolbarLayout();
    super.destroy();
    this.defaultUI.destroy();
  }

  private initMobileToolbarLayout() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.applyMobileToolbarLayout();
    this.eventEmitter.listen('changeMode.mobileToolbar', this.handleMobileToolbarLayoutChange);
    this.eventEmitter.listen(
      'changePreviewStyle.mobileToolbar',
      this.handleMobileToolbarLayoutChange
    );
    this.eventEmitter.listen('changeTheme.mobileToolbar', this.handleMobileToolbarLayoutChange);
    window.addEventListener('resize', this.handleMobileToolbarViewportSync);
    window.addEventListener('orientationchange', this.handleMobileToolbarLayoutChange);
    document.addEventListener('focusin', this.handleMobileToolbarLayoutChange);
    document.addEventListener('focusout', this.handleMobileToolbarLayoutChange);
    window.visualViewport?.addEventListener('resize', this.handleMobileToolbarViewportSync);
    window.visualViewport?.addEventListener('scroll', this.handleMobileToolbarViewportSync);
    const rootEl = this.getEditorRootEl();

    rootEl?.addEventListener('touchstart', this.handleMobilePinchZoomStart, {
      capture: true,
      passive: false,
    });
    rootEl?.addEventListener('touchmove', this.handleMobilePinchZoomMove, {
      capture: true,
      passive: false,
    });
    rootEl?.addEventListener('touchend', this.finishMobilePinchZoom, true);
    rootEl?.addEventListener('touchcancel', this.finishMobilePinchZoom, true);
    rootEl?.addEventListener('gesturestart', this.handleMobileChromeGesture, true);
    rootEl?.addEventListener('gesturechange', this.handleMobileChromeGesture, true);
  }

  private destroyMobileToolbarLayout() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.eventEmitter.removeEventHandler('.mobileToolbar');
    window.removeEventListener('resize', this.handleMobileToolbarViewportSync);
    window.removeEventListener('orientationchange', this.handleMobileToolbarLayoutChange);
    document.removeEventListener('focusin', this.handleMobileToolbarLayoutChange);
    document.removeEventListener('focusout', this.handleMobileToolbarLayoutChange);
    window.visualViewport?.removeEventListener('resize', this.handleMobileToolbarViewportSync);
    window.visualViewport?.removeEventListener('scroll', this.handleMobileToolbarViewportSync);
    const rootEl = this.getEditorRootEl();

    rootEl?.removeEventListener('touchstart', this.handleMobilePinchZoomStart, true);
    rootEl?.removeEventListener('touchmove', this.handleMobilePinchZoomMove, true);
    rootEl?.removeEventListener('touchend', this.finishMobilePinchZoom, true);
    rootEl?.removeEventListener('touchcancel', this.finishMobilePinchZoom, true);
    rootEl?.removeEventListener('gesturestart', this.handleMobileChromeGesture, true);
    rootEl?.removeEventListener('gesturechange', this.handleMobileChromeGesture, true);
    this.pinchZoomSession = null;
    this.clearMobileToolbarTimers();
  }

  private clearMobileToolbarTimers() {
    if (this.mobileViewportSyncTimer !== null) {
      clearTimeout(this.mobileViewportSyncTimer);
      this.mobileViewportSyncTimer = null;
    }
    if (this.mobileViewportSyncFrame !== null) {
      cancelAnimationFrame(this.mobileViewportSyncFrame);
      this.mobileViewportSyncFrame = null;
    }
  }

  private getEditorRootEl() {
    return this.layout?.refs.el || null;
  }

  private getToolbarEl() {
    return this.getEditorRootEl()?.querySelector('.toastui-editor-toolbar') as HTMLElement | null;
  }

  private applyMobileTextZoom() {
    const rootEl = this.getEditorRootEl();

    if (!rootEl) {
      return;
    }

    rootEl.style.setProperty('--toastui-editor-text-zoom', this.currentMobileTextZoom.toFixed(3));
  }

  private handleMobileToolbarViewportSync = () => {
    this.scheduleMobileToolbarViewportSync();
  };

  private handleMobileToolbarLayoutChange = () => {
    this.scheduleMobileToolbarViewportSync(80);
  };

  private scheduleMobileToolbarViewportSync(delayMs = 0) {
    this.clearMobileToolbarTimers();

    const run = () => {
      this.mobileViewportSyncFrame = requestAnimationFrame(() => {
        this.mobileViewportSyncFrame = null;
        this.applyMobileToolbarLayout();
      });
    };

    if (delayMs > 0) {
      this.mobileViewportSyncTimer = window.setTimeout(() => {
        this.mobileViewportSyncTimer = null;
        run();
      }, delayMs);

      return;
    }

    run();
  }

  private applyMobileToolbarLayout() {
    const rootEl = this.getEditorRootEl();

    if (!rootEl) {
      return;
    }

    const isMobile = isMobileLikeDevice();

    rootEl.classList.toggle('toastui-editor-mobile-device', isMobile);

    if (!isMobile) {
      rootEl.style.removeProperty('--mobile-toolbar-viewport-offset');
      rootEl.style.removeProperty('--mobile-toolbar-height');
      rootEl.style.removeProperty('--mobile-toolbar-left');
      rootEl.style.removeProperty('--mobile-toolbar-width');
      rootEl.style.removeProperty('--toastui-editor-text-zoom');
      this.currentMobileTextZoom = MOBILE_TEXT_ZOOM_DEFAULT;
      this.pinchZoomSession = null;

      return;
    }

    this.applyMobileTextZoom();

    const toolbarEl = this.getToolbarEl();
    const viewportOffset = getMobileToolbarViewportOffset();

    rootEl.style.setProperty('--mobile-toolbar-viewport-offset', `${viewportOffset}px`);

    if (toolbarEl) {
      const toolbarHeight = Math.max(0, Math.ceil(toolbarEl.getBoundingClientRect().height));

      if (toolbarHeight > 0) {
        rootEl.style.setProperty('--mobile-toolbar-height', `${toolbarHeight}px`);
      }
    }

    const rootRect = rootEl.getBoundingClientRect();

    rootEl.style.setProperty(
      '--mobile-toolbar-left',
      `${Math.max(0, Math.round(rootRect.left))}px`
    );
    rootEl.style.setProperty(
      '--mobile-toolbar-width',
      `${Math.max(0, Math.round(rootRect.width))}px`
    );
  }

  private handleMobilePinchZoomStart = (event: TouchEvent) => {
    if (!isMobileLikeDevice() || event.touches.length !== 2) {
      return;
    }
    if (!isEditorContentTouchTarget(event.target)) {
      event.preventDefault();
      return;
    }

    const startDistance = getTouchDistance(event.touches[0], event.touches[1]);

    if (!Number.isFinite(startDistance) || startDistance <= 0) {
      return;
    }

    this.pinchZoomSession = {
      startDistance,
      startZoom: this.currentMobileTextZoom,
    };
    event.preventDefault();
  };

  private handleMobilePinchZoomMove = (event: TouchEvent) => {
    if (!isMobileLikeDevice() || event.touches.length !== 2) {
      return;
    }
    if (!isEditorContentTouchTarget(event.target)) {
      event.preventDefault();
      return;
    }
    if (!this.pinchZoomSession) {
      return;
    }

    const nextDistance = getTouchDistance(event.touches[0], event.touches[1]);

    if (!Number.isFinite(nextDistance) || nextDistance <= 0) {
      return;
    }

    const scale = nextDistance / this.pinchZoomSession.startDistance;

    this.currentMobileTextZoom = clampMobileTextZoom(this.pinchZoomSession.startZoom * scale);
    this.applyMobileTextZoom();
    event.preventDefault();
  };

  private finishMobilePinchZoom = () => {
    this.pinchZoomSession = null;
  };

  private handleMobileChromeGesture = (event: Event) => {
    if (!isMobileLikeDevice()) {
      return;
    }
    if (isEditorContentTouchTarget(event.target)) {
      return;
    }

    event.preventDefault();
  };
}

export default ToastUIEditor;
