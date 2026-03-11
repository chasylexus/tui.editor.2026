import 'jest-canvas-mock';
import { PluginOptions } from '@t/index';
import {
  default as chartPlugin,
  parseToChartOption,
  parseToChartData,
  detectDelimiter,
  setDefaultOptions,
  applyLineNullGapMode,
  resolveTooltipCategoryIndex,
  getTooltipRawSeriesValue,
  ChartOptions,
} from '@/index';

const chartRenderMock = jest.fn(({ el }: { el: HTMLElement }) => {
  const marker = document.createElement('div');

  marker.className = '__chart-render';
  el.appendChild(marker);

  return {
    destroy: jest.fn(() => {
      marker.remove();
    }),
  };
});

jest.mock('@techie_doubts/tui.chart.2026', () => {
  return {
    __esModule: true,
    default: {
      barChart: (args: { el: HTMLElement }) => chartRenderMock(args),
      columnChart: (args: { el: HTMLElement }) => chartRenderMock(args),
      areaChart: (args: { el: HTMLElement }) => chartRenderMock(args),
      lineChart: (args: { el: HTMLElement }) => chartRenderMock(args),
      pieChart: (args: { el: HTMLElement }) => chartRenderMock(args),
      scatterChart: (args: { el: HTMLElement }) => chartRenderMock(args),
      radarChart: (args: { el: HTMLElement }) => chartRenderMock(args),
    },
  };
});

describe('parseToChartOption()', () => {
  it('should parse option code into object', () => {
    expect(
      parseToChartOption(`
          key1.keyA: value1
          key1.keyB: value2
        `)
    ).toEqual({
      key1: {
        keyA: 'value1',
        keyB: 'value2',
      },
    });
  });

  it('should parse option code into object with reserved keys(type, url)', () => {
    // type & url -> editor.Chart & editorChart.url
    expect(
      parseToChartOption(`
          type: line
          url: http://some.url/to/data/file
        `)
    ).toEqual({
      editorChart: {
        type: 'line',
        url: 'http://some.url/to/data/file',
      },
    });
  });

  it('should parse option code into object with 1 depth keys(without dot)', () => {
    // keyA & keyB ... -> chart.keyA, chart.keyB ...
    expect(
      parseToChartOption(`
          keyA: value1
          keyB: value2
        `)
    ).toEqual({
      chart: {
        keyA: 'value1',
        keyB: 'value2',
      },
    });
  });

  it('should parse option code into object with x & y keys', () => {
    // x & y keys should be translated to xAxis & yAxis
    expect(
      parseToChartOption(`
          x.keyA: value1
          y.keyB: value2
        `)
    ).toEqual({
      xAxis: {
        keyA: 'value1',
      },
      yAxis: {
        keyB: 'value2',
      },
    });
  });

  it('should map y.min/y.max to yAxis.scale for @techie_doubts/tui.chart.2026 v4', () => {
    expect(
      parseToChartOption(`
          y.min: 0
          y.max: 40
          x.min: 10
          x.stepSize: 5
        `)
    ).toEqual({
      yAxis: {
        scale: { min: 0, max: 40 },
      },
      xAxis: {
        scale: { min: 10, stepSize: 5 },
      },
    });
  });

  it('should parse option code into object with string numeric value', () => {
    expect(
      parseToChartOption(`
          key1.keyA: 1.234
          key1.keyB: 12
        `)
    ).toEqual({
      key1: {
        keyA: 1.234,
        keyB: 12,
      },
    });
  });

  it('should parse option code into object with string array value', () => {
    expect(
      parseToChartOption(`
          key1.keyA: [1,2]
          key1.keyB: ["a", "b"]
        `)
    ).toEqual({
      key1: {
        keyA: [1, 2],
        keyB: ['a', 'b'],
      },
    });
  });

  it('should parse option code into object with string object value', () => {
    expect(
      parseToChartOption(`
          key1.keyA: {"k1": "v1"}
          key1.keyB: {"k2": "v2"}
        `)
    ).toEqual({
      key1: {
        keyA: {
          k1: 'v1',
        },
        keyB: {
          k2: 'v2',
        },
      },
    });
  });

  it('should parse series.styles with unicode series key as plain object', () => {
    expect(
      parseToChartOption(`
          series.styles: {"План со сдвигом":{"lineStyle":"dashDot","lineWidth":3}}
        `)
    ).toEqual({
      series: {
        styles: {
          'План со сдвигом': {
            lineStyle: 'dashDot',
            lineWidth: 3,
          },
        },
      },
    });
  });
});

describe('chart render lifecycle', () => {
  class TestEmitter {
    private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

    listen(eventName: string, handler: (...args: unknown[]) => void) {
      this.handlers[eventName] = this.handlers[eventName] || [];
      this.handlers[eventName].push(handler);
    }

    emit(eventName: string, ...args: unknown[]) {
      (this.handlers[eventName] || []).forEach((handler) => handler(...args));
    }
  }

  class TestResizeObserver {
    static instances: TestResizeObserver[] = [];

    callback: ResizeObserverCallback;

    observe = jest.fn();

    disconnect = jest.fn();

    unobserve = jest.fn();

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      TestResizeObserver.instances.push(this);
    }
  }

  const originalResizeObserver = global.ResizeObserver;

  function createRect(width: number): DOMRect {
    return {
      width,
      height: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    } as DOMRect;
  }

  beforeEach(() => {
    chartRenderMock.mockClear();
    document.body.innerHTML = '';
    TestResizeObserver.instances = [];
    global.ResizeObserver = (TestResizeObserver as unknown) as typeof ResizeObserver;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    global.ResizeObserver = originalResizeObserver;
  });

  function waitNextFrame() {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  }

  async function waitFrames(frameCount: number): Promise<void> {
    if (frameCount <= 0) {
      return;
    }

    await waitNextFrame();
    await waitFrames(frameCount - 1);
  }

  it('should keep a single chart render on initial load/loadUI re-renders', async () => {
    const eventEmitter = new TestEmitter();
    const pluginInfo = chartPlugin(
      {
        usageStatistics: false,
        eventEmitter: eventEmitter as any,
        instance: {},
      } as any,
      {} as PluginOptions
    );

    const rendered = (pluginInfo.toHTMLRenderers as any)?.chart?.({
      literal: ['x,y', 'a,1', 'b,2', '', 'type: line'].join('\n'),
    } as any);

    expect(rendered).toBeTruthy();

    const openTag = rendered![0] as any;
    const chartContainer = document.createElement('div');
    const attributes = openTag.attributes || {};

    Object.keys(attributes).forEach((key) => {
      chartContainer.setAttribute(key, attributes[key]);
    });
    document.body.appendChild(chartContainer);

    eventEmitter.emit('load');
    eventEmitter.emit('loadUI');

    await waitFrames(12);

    expect(chartRenderMock).toHaveBeenCalled();
    expect(chartContainer.querySelectorAll('.__chart-render')).toHaveLength(1);
  });

  it('should rerender charts when editor root width changes', async () => {
    const eventEmitter = new TestEmitter();
    const root = document.createElement('div');
    const chartHost = document.createElement('div');
    let width = 320;

    root.className = 'toastui-editor-defaultUI';
    root.appendChild(chartHost);
    document.body.appendChild(root);

    const rootRectSpy = jest
      .spyOn(root, 'getBoundingClientRect')
      .mockImplementation(() => createRect(width));
    const hostRectSpy = jest
      .spyOn(chartHost, 'getBoundingClientRect')
      .mockImplementation(() => createRect(width));

    const pluginInfo = chartPlugin(
      {
        usageStatistics: false,
        eventEmitter: eventEmitter as any,
        instance: {
          getEditorElements: () => {
            return {
              mdPreview: chartHost,
              wwEditor: chartHost,
            };
          },
        },
      } as any,
      {} as PluginOptions
    );

    const rendered = (pluginInfo.toHTMLRenderers as any)?.chart?.({
      literal: ['x,y', 'a,1', 'b,2', '', 'type: line'].join('\n'),
    } as any);

    const openTag = rendered![0] as any;
    const chartContainer = document.createElement('div');
    const attributes = openTag.attributes || {};

    Object.keys(attributes).forEach((key) => {
      chartContainer.setAttribute(key, attributes[key]);
    });
    chartHost.appendChild(chartContainer);

    eventEmitter.emit('load');

    await waitFrames(12);

    const renderCountAfterLoad = chartRenderMock.mock.calls.length;

    expect(renderCountAfterLoad).toBeGreaterThanOrEqual(1);
    expect(TestResizeObserver.instances).toHaveLength(1);

    width = 260;
    TestResizeObserver.instances[0].callback(
      [{ contentRect: { width } } as ResizeObserverEntry],
      (TestResizeObserver.instances[0] as unknown) as ResizeObserver
    );

    await waitFrames(12);

    expect(chartRenderMock.mock.calls.length).toBe(renderCountAfterLoad + 1);

    rootRectSpy.mockRestore();
    hostRectSpy.mockRestore();
  });

  it('should rerender charts after fallback width becomes measurable', async () => {
    const eventEmitter = new TestEmitter();
    const host = document.createElement('div');
    let width = 0;

    document.body.appendChild(host);

    const hostRectSpy = jest
      .spyOn(host, 'getBoundingClientRect')
      .mockImplementation(() => createRect(width));

    const pluginInfo = chartPlugin(
      {
        usageStatistics: false,
        eventEmitter: eventEmitter as any,
        instance: {
          getEditorElements: () => {
            return {
              mdPreview: host,
              wwEditor: host,
            };
          },
        },
      } as any,
      {} as PluginOptions
    );

    const rendered = (pluginInfo.toHTMLRenderers as any)?.chart?.({
      literal: ['x,y', 'a,1', 'b,2', '', 'type: radar'].join('\n'),
    } as any);

    const openTag = rendered![0] as any;
    const chartContainer = document.createElement('div');
    const attributes = openTag.attributes || {};

    Object.keys(attributes).forEach((key) => {
      chartContainer.setAttribute(key, attributes[key]);
    });

    const chartRectSpy = jest
      .spyOn(chartContainer, 'getBoundingClientRect')
      .mockImplementation(() => createRect(width));

    host.appendChild(chartContainer);

    eventEmitter.emit('load');

    await waitFrames(4);

    const renderCountAfterFallbackLoad = chartRenderMock.mock.calls.length;

    expect(renderCountAfterFallbackLoad).toBeGreaterThanOrEqual(1);

    width = 280;
    await waitFrames(20);

    expect(chartRenderMock.mock.calls.length).toBe(renderCountAfterFallbackLoad + 1);

    chartRectSpy.mockRestore();
    hostRectSpy.mockRestore();
  });
});

describe('parseToChartData()', () => {
  it('should parse csv to @techie_doubts/tui.chart.2026 data format', () => {
    expect(
      parseToChartData(
        `
            ,series a,series b
            category 1, 1.234, 2.345
            category 2, 3.456, 4.567
          `,
        ','
      )
    ).toEqual({
      categories: ['category 1', 'category 2'],
      series: [
        {
          name: 'series a',
          data: [1.234, 3.456],
        },
        {
          name: 'series b',
          data: [2.345, 4.567],
        },
      ],
    });
  });

  it('should parse tsv to @techie_doubts/tui.chart.2026 data format', () => {
    expect(
      parseToChartData(
        `
            \tseries a\tseries b
            category 1\t1.234\t2.345
            category 2\t3.456\t4.567
          `,
        '\t'
      )
    ).toEqual({
      categories: ['category 1', 'category 2'],
      series: [
        {
          name: 'series a',
          data: [1.234, 3.456],
        },
        {
          name: 'series b',
          data: [2.345, 4.567],
        },
      ],
    });
  });

  it('should parse whitespace separated values to @techie_doubts/tui.chart.2026 data format', () => {
    expect(
      parseToChartData(
        ['\t"series a" "series b"', '"category 1" 1.234 2.345', '"category 2" 3.456 4.567'].join(
          '\n'
        ),
        /\s+/
      )
    ).toEqual({
      categories: ['category 1', 'category 2'],
      series: [
        {
          name: 'series a',
          data: [1.234, 3.456],
        },
        {
          name: 'series b',
          data: [2.345, 4.567],
        },
      ],
    });
  });

  it('should parse data with legends to @techie_doubts/tui.chart.2026 data format', () => {
    expect(
      parseToChartData(
        `
            series a,series b
            1.234, 2.345
            3.456, 4.567
          `,
        ','
      )
    ).toEqual({
      categories: [],
      series: [
        {
          name: 'series a',
          data: [1.234, 3.456],
        },
        {
          name: 'series b',
          data: [2.345, 4.567],
        },
      ],
    });
  });

  it('should parse data with categories to @techie_doubts/tui.chart.2026 data format', () => {
    expect(
      parseToChartData(
        `
            category 1, 1.234, 2.345
            category 2, 3.456, 4.567
          `,
        ','
      )
    ).toEqual({
      categories: ['category 1', 'category 2'],
      series: [
        {
          data: [1.234, 3.456],
        },
        {
          data: [2.345, 4.567],
        },
      ],
    });
  });

  it('should keep sparse series when values are missing on alternating categories', () => {
    expect(
      parseToChartData(
        `
            ,Series Even,Series Odd
            0,1
            1,,2
            2,3
            3,,4
            4,5
            5,,6
          `,
        ','
      )
    ).toEqual({
      categories: ['0', '1', '2', '3', '4', '5'],
      series: [
        {
          name: 'Series Even',
          data: [1, null, 3, null, 5, null],
        },
        {
          name: 'Series Odd',
          data: [null, 2, null, 4, null, 6],
        },
      ],
    });
  });

  it('should parse labeled scatter rows into point coordinates', () => {
    expect(
      parseToChartData(
        `
            Платформа,X,Y,Комментарий
            Google,5,5,global leader
            Meta,5,4.5,social ecosystem
            Amazon,4.5,5,commerce ecosystem
          `,
        ',',
        'scatter'
      )
    ).toEqual({
      series: [
        {
          name: 'Points',
          data: [
            { x: 5, y: 5, label: 'Google' },
            { x: 5, y: 4.5, label: 'Meta' },
            { x: 4.5, y: 5, label: 'Amazon' },
          ],
        },
      ],
    });
  });

  it('should parse radar matrix data (rows=features, columns=series)', () => {
    expect(
      parseToChartData(
        `
            ,Alpha,Beta,Gamma
            Speed,4.2,3.5,4.8
            Quality,4.7,3.9,4.3
            Cost,2.1,3.8,2.9
            Reliability,4.4,3.7,4.6
          `,
        ',',
        'radar'
      )
    ).toEqual({
      categories: ['Speed', 'Quality', 'Cost', 'Reliability'],
      series: [
        {
          name: 'Alpha',
          data: [4.2, 4.7, 2.1, 4.4],
        },
        {
          name: 'Beta',
          data: [3.5, 3.9, 3.8, 3.7],
        },
        {
          name: 'Gamma',
          data: [4.8, 4.3, 2.9, 4.6],
        },
      ],
    });
  });
});

describe('detectDelimiter()', () => {
  it('should detect csv', () => {
    expect(
      detectDelimiter(`
          ,series a,series b
          category 1, 1.234, 2.345
          category 2, 3.456, 4.567
        `)
    ).toEqual(',');
  });

  it('should detect tsv', () => {
    expect(
      detectDelimiter(`
          \tseries a\tseries b
          category 1\t1.234\t2.345
          category 2\t3.456\t4.567
        `)
    ).toEqual('\t');
  });

  it('should detect regex', () => {
    expect(
      detectDelimiter(
        ['\t"series a" "series b"', '"category 1"\t1.234 2.345', '"category 2" 3.456 4.567'].join(
          '\n'
        )
      )
    ).toEqual(/\s+/);
  });
});

describe('setDefaultOptions', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should respect default min/max width/height', () => {
    const chartOptions = setDefaultOptions(
      {
        chart: {
          width: -10,
          height: -10,
        },
      } as ChartOptions,
      {} as PluginOptions,
      container
    );

    expect(chartOptions.chart!.width).toBe(0);
    expect(chartOptions.chart!.height).toBe(0);
  });

  it('should respect default width/height', () => {
    const chartOptions = setDefaultOptions(
      {} as ChartOptions,
      {
        width: 300,
        height: 400,
      } as PluginOptions,
      container
    );

    expect(chartOptions.chart!.width).toBe(300);
    expect(chartOptions.chart!.height).toBe(400);
  });

  it('should use width/height from codeblock', () => {
    const pluginOptions = {
      minWidth: 300,
      minHeight: 400,
      maxWidth: 700,
      maxHeight: 800,
      width: 400,
      height: 500,
    };
    const chartOptions = setDefaultOptions(
      {
        chart: {
          width: 500,
          height: 600,
        },
      } as ChartOptions,
      pluginOptions,
      container
    );

    expect(chartOptions.chart!.width).toBe(500);
    expect(chartOptions.chart!.height).toBe(600);
  });

  it('should respect min/max width/height', () => {
    const pluginOptions = {
      minWidth: 300,
      minHeight: 400,
      maxWidth: 700,
      maxHeight: 800,
    } as PluginOptions;
    let chartOptions = setDefaultOptions(
      {
        chart: {
          width: 200,
          height: 200,
        },
      } as ChartOptions,
      pluginOptions,
      container
    );

    expect(chartOptions.chart!.width).toBe(300);
    expect(chartOptions.chart!.height).toBe(400);

    chartOptions = setDefaultOptions(
      {
        chart: {
          width: 1000,
          height: 1000,
        },
      } as ChartOptions,
      pluginOptions,
      container
    );
    expect(chartOptions.chart!.width).toBe(700);
    expect(chartOptions.chart!.height).toBe(800);
  });

  it('should use fallback width when container is hidden', () => {
    const rectSpy = jest.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    } as DOMRect);

    const chartOptions = setDefaultOptions(
      {
        chart: {
          width: 'auto',
          height: 'auto',
        },
      } as ChartOptions,
      {} as PluginOptions,
      container
    );

    expect(chartOptions.chart!.width).toBe(600);
    expect(chartOptions.chart!.height).toBe(600);

    rectSpy.mockRestore();
  });

  it('should downscale explicit chart size proportionally on narrow containers', () => {
    const rectSpy = jest.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 320,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    } as DOMRect);

    const chartOptions = setDefaultOptions(
      {
        chart: {
          width: 700,
          height: 420,
        },
      } as ChartOptions,
      {} as PluginOptions,
      container
    );

    expect(chartOptions.chart!.width).toBe(320);
    expect(chartOptions.chart!.height).toBeCloseTo(192);

    rectSpy.mockRestore();
  });

  it('should deep-merge plugin chartOptions and codeblock options', () => {
    const chartOptions = setDefaultOptions(
      {
        editorChart: {},
        tooltip: {
          offsetX: 12,
        },
        yAxis: {
          suffix: '%',
        },
      } as ChartOptions,
      {
        chartOptions: {
          tooltip: {
            transition: '0.2s',
          },
          yAxis: {
            thousands: true,
          },
        },
      } as PluginOptions,
      container
    );

    expect(chartOptions.tooltip!.offsetX).toBe(12);
    expect(chartOptions.tooltip!.transition).toBe('0.2s');
    expect((chartOptions as any).yAxis.__editorThousands).toEqual({ mode: 'locale' });
    expect((chartOptions as any).yAxis.label.formatter('1000')).toMatch(/^1\D000%$/);
  });

  it('should use custom thousands separator for axis and tooltip', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: {},
        tooltip: {},
        yAxis: {
          thousands: '_',
        },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );

    expect((chartOptions as any).yAxis.__editorThousands).toEqual({
      mode: 'custom',
      separator: '_',
    });
    expect((chartOptions as any).yAxis.label.formatter('1000000')).toBe('1_000_000');

    const tooltipFormatter = chartOptions.tooltip!.formatter as Function;
    const formatted = tooltipFormatter.call(
      { store: { state: { options: chartOptions } } },
      1234567.8
    );

    expect(formatted).toBe('1_234_567.80');
  });

  it('should apply xAxis formatter to tooltip header category', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: {},
        tooltip: {},
        xAxis: {
          thousands: '_',
        },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );
    const tooltipTemplate = chartOptions.tooltip!.template as Function;
    const tooltipMarkup = tooltipTemplate.call(
      {
        store: {
          state: {
            options: {
              ...chartOptions,
              editorCategoryLabels: ['1000000'],
            },
            series: {
              line: {
                data: [
                  {
                    name: 'A',
                    rawData: [1],
                  },
                ],
              },
            },
          },
        },
      },
      {
        category: '1000000',
        data: [{ seriesIndex: 0, index: 0, category: '1000000', value: 1, label: 'A' }],
      },
      { header: '', body: '' },
      {}
    );

    expect((chartOptions as any).xAxis.__editorThousands).toEqual({
      mode: 'custom',
      separator: '_',
    });
    expect(tooltipMarkup).toContain('1_000_000');
  });

  it('should not add thousands separator when y.thousands is not set', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: {},
        tooltip: {},
        yAxis: {},
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );

    expect((chartOptions as any).yAxis.__editorThousands).toEqual({ mode: 'none' });
    expect((chartOptions as any).yAxis.label).toBeUndefined();

    const tooltipFormatter = chartOptions.tooltip!.formatter as Function;
    const formatted = tooltipFormatter.call(
      { store: { state: { options: chartOptions } } },
      1234567.8
    );

    expect(formatted).toBe('1234567.80');
  });

  it('should alias series.styles by normalized series name to index keys', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'line' },
        series: {
          styles: {
            ' "План   со сдвигом" ': {
              lineStyle: 'dashDot',
              lineWidth: 4,
            },
          },
        },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container,
      {
        categories: ['A', 'B'],
        series: [
          { name: 'План со сдвигом', data: [1, 2] },
          { name: 'Факт', data: [3, 4] },
        ],
      }
    );

    expect((chartOptions as any).series.styles['0']).toEqual({
      lineStyle: 'dashDot',
      lineWidth: 4,
    });
  });

  it('should auto-enable showDot for sparse isolated points in line/area charts', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'line' },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container,
      {
        categories: ['0', '1', '2', '3', '4', '5'],
        series: [
          { name: 'Even', data: [1, null, 3, null, 5, null] },
          { name: 'Odd', data: [null, 2, null, 4, null, 6] },
        ],
      }
    );

    expect((chartOptions as any).series.showDot).toBe(true);
  });

  it('should not override explicit showDot option for sparse isolated points', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'line' },
        series: {
          showDot: false,
        },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container,
      {
        categories: ['0', '1', '2', '3'],
        series: [
          { name: 'Even', data: [1, null, 3, null] },
          { name: 'Odd', data: [null, 2, null, 4] },
        ],
      }
    );

    expect((chartOptions as any).series.showDot).toBe(false);
  });

  it('should connect null gaps by default for line chart', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'line' },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );
    const rawData = {
      categories: ['0', '1', '2', '3'],
      series: [
        {
          name: 'A',
          data: [1, null, 3, null] as (number | null)[],
        },
      ],
    };

    const adjusted = applyLineNullGapMode(chartOptions, rawData as any)!;

    expect(adjusted.series[0].data).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(adjusted.categories).toBeUndefined();
    expect((adjusted.series[0] as any).editorRawData).toEqual([1, null, 3, null]);
    expect((chartOptions as any).series.eventDetectType).toBe('near');
  });

  it('should preserve numeric x categories when connecting null gaps', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'line' },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );
    const rawData = {
      categories: ['43461', '455000', '600000'],
      series: [
        {
          name: 'A',
          data: [1672, null, 2222] as (number | null)[],
        },
      ],
    };

    const adjusted = applyLineNullGapMode(chartOptions, rawData as any)!;

    expect(adjusted.series[0].data).toEqual([
      [43461, 1672],
      [600000, 2222],
    ]);
    expect(adjusted.categories).toBeUndefined();
  });

  it('should not override explicit series.eventDetectType', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'line' },
        series: {
          eventDetectType: 'point',
        },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );
    const rawData = {
      categories: ['0', '1', '2', '3'],
      series: [
        {
          name: 'A',
          data: [1, null, 3, null] as (number | null)[],
        },
      ],
    };

    applyLineNullGapMode(chartOptions, rawData as any)!;

    expect((chartOptions as any).series.eventDetectType).toBe('point');
  });

  it('should resolve tooltip category index by category label for connectNulls mode', () => {
    const tooltipComponent = {
      store: {
        state: {
          options: {
            editorCategoryLabels: ['43461', '455000', '600000'],
          },
        },
      },
    };
    const model = {
      category: '455000',
      data: [{ seriesIndex: 1, index: 0, category: '455000' }],
    };

    expect(resolveTooltipCategoryIndex(tooltipComponent, model)).toBe(1);
  });

  it('should resolve tooltip category index by category floor for numeric labels', () => {
    const tooltipComponent = {
      store: {
        state: {
          options: {
            editorCategoryLabels: ['0', '2', '4', '6'],
          },
        },
      },
    };
    const model = {
      category: '5.5',
      data: [{ seriesIndex: 0, index: 3, category: '5.5' }],
    };

    expect(resolveTooltipCategoryIndex(tooltipComponent, model)).toBe(2);
  });

  it('should use exact series value on resolved category index for connected null-gap series', () => {
    const seriesItem = {
      editorRawData: [1672, null, 2222, null],
      data: [
        [43461, 1672],
        [600000, 2222],
      ],
    };

    expect(getTooltipRawSeriesValue(seriesItem, 0)).toBe(1672);
    expect(getTooltipRawSeriesValue(seriesItem, 1)).toBeNull();
    expect(getTooltipRawSeriesValue(seriesItem, 2)).toBe(2222);
  });

  it('should fallback to tooltip model index when category labels are unavailable', () => {
    const tooltipComponent = {
      store: {
        state: {
          options: {},
        },
      },
    };
    const model = {
      data: [{ seriesIndex: 0, index: 2 }],
    };

    expect(resolveTooltipCategoryIndex(tooltipComponent, model)).toBe(2);
  });

  it('should keep gaps when series.breakOnNull is true', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'line' },
        series: {
          breakOnNull: true,
        },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );
    const rawData = {
      categories: ['0', '1', '2', '3'],
      series: [
        {
          name: 'A',
          data: [1, null, 3, null] as (number | null)[],
        },
      ],
    };

    const adjusted = applyLineNullGapMode(chartOptions, rawData as any)!;

    expect(adjusted.series[0].data).toEqual([1, null, 3, null]);
    expect((adjusted.series[0] as any).editorRawData).toBeUndefined();
  });

  it('should keep gaps when series.connectNulls is false', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'line' },
        series: {
          connectNulls: false,
        },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );
    const rawData = {
      categories: ['0', '1', '2', '3'],
      series: [
        {
          name: 'A',
          data: [1, null, 3, null] as (number | null)[],
        },
      ],
    };

    const adjusted = applyLineNullGapMode(chartOptions, rawData as any)!;

    expect(adjusted.series[0].data).toEqual([1, null, 3, null]);
  });

  it('should configure default tooltip formatter/template only when missing', () => {
    const customTemplate = jest.fn(() => '<div>custom</div>');
    const customFormatter = jest.fn(() => 'custom');
    const withDefaults = setDefaultOptions({} as ChartOptions, {} as PluginOptions, container);
    const withCustom = setDefaultOptions(
      {
        editorChart: {},
        tooltip: {
          template: customTemplate,
          formatter: customFormatter,
        },
      } as ChartOptions,
      {} as PluginOptions,
      container
    );

    expect(withDefaults.tooltip!.transition).toBe(false);
    expect(typeof withDefaults.tooltip!.formatter).toBe('function');
    expect(typeof withDefaults.tooltip!.template).toBe('function');
    expect(withCustom.tooltip!.template).toBe(customTemplate);
    expect(withCustom.tooltip!.formatter).toBe(customFormatter);
  });

  it('should keep default scatter tooltip template and format coordinate values', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'scatter' },
        xAxis: {
          label: {
            formatter: (value: string) => `x=${value}`,
          },
        },
        yAxis: {
          label: {
            formatter: (value: string) => `y=${value}`,
          },
        },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );

    expect(typeof chartOptions.tooltip!.formatter).toBe('function');
    expect(chartOptions.tooltip!.template).toBeUndefined();
    expect(
      chartOptions.tooltip!.formatter!.call(
        {
          store: {
            state: {
              options: chartOptions,
            },
          },
        },
        { x: 5, y: 4.5 }
      )
    ).toBe('(x=5, y=4.5)');
  });

  it('should hide default singleton scatter legend (Points) when visibility is not explicitly set', () => {
    const chartData = {
      series: [
        {
          name: 'Points',
          data: [
            { x: 1, y: 2, label: 'A' },
            { x: 2, y: 3, label: 'B' },
          ],
        },
      ],
    };
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'scatter' },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container,
      chartData as any
    );

    expect(chartOptions.legend).toEqual({ visible: false });
  });

  it('should keep explicit scatter legend visibility setting', () => {
    const chartData = {
      series: [
        {
          name: 'Points',
          data: [{ x: 1, y: 2, label: 'A' }],
        },
      ],
    };
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'scatter' },
        legend: { visible: true },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container,
      chartData as any
    );

    expect(chartOptions.legend).toEqual({ visible: true });
  });

  it('should convert scatter label formatter keyword into formatter function', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'scatter' },
        series: {
          dataLabels: {
            visible: true,
            formatter: 'label',
          },
        },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );

    expect(typeof (chartOptions.series as any).dataLabels.formatter).toBe('function');
    expect((chartOptions.series as any).dataLabels.formatter(null, { label: 'Google' })).toBe(
      'Google'
    );
  });

  it('should normalize type-scoped series theme for single scatter chart', () => {
    const chartOptions = setDefaultOptions(
      ({
        editorChart: { type: 'scatter' },
        theme: {
          series: {
            colors: ['#4A90D9'],
            scatter: {
              dataLabels: {
                callout: {
                  lineWidth: 4,
                  lineColor: '#ff3355',
                  useSeriesColor: false,
                },
              },
            },
          },
        },
      } as unknown) as ChartOptions,
      {} as PluginOptions,
      container
    );

    expect((chartOptions as any).theme.series.colors).toEqual(['#4A90D9']);
    expect((chartOptions as any).theme.series.dataLabels.callout).toEqual({
      lineWidth: 4,
      lineColor: '#ff3355',
      useSeriesColor: false,
    });
    expect((chartOptions as any).theme.series.scatter).toBeUndefined();
  });
});
