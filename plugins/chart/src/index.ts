/**
 * Chart plugin for @techie_doubts/tui.editor.2026 using @techie_doubts/tui.chart.2026 v4.
 *
 * Shorthand option syntax (left) and what it maps to in the v4 API (right):
 *
 * @example
 * ```chart
 * ,cat1,cat2                   CSV/TSV chart data
 * Jan,21,23
 * Feb,35,45
 *
 * type: area                   => editorChart.type  (bar | column | line | area | pie | scatter | radar)
 * url: http://url/to/data      => editorChart.url   (fetch CSV from URL)
 * width: 700                   => chart.width
 * height: 300                  => chart.height
 * title: Monthly Revenue       => chart.title
 * x.title: Amount              => xAxis.title
 * x.min: 0                     => xAxis.scale.min
 * x.max: 9000                  => xAxis.scale.max
 * x.stepSize: 1000             => xAxis.scale.stepSize
 * x.suffix: $                  => xAxis.label.formatter  (appends suffix)
 * x.thousands: true             => xAxis.label.formatter  (adds thousand separators)
 * y.title: Month               => yAxis.title
 * y.min: 0                     => yAxis.scale.min
 * y.max: 100                   => yAxis.scale.max
 * y.suffix: %                  => yAxis.label.formatter  (appends suffix)
 * y.thousands: true             => yAxis.label.formatter  (adds thousand separators)
 * series.lineWidth: 3          => series.lineWidth (global line thickness)
 * series.lineStyle: "dashed"   => series.lineStyle (global line dash preset)
 * series.connectNulls: true     => connect line/area segments across null values (default true)
 * series.breakOnNull: true      => force gap breaks on null values (overrides connectNulls)
 * series.styles: {"Plan":{"lineStyle":"dashDot","lineWidth":2}} => per-series line style/width
 * ```
 */
import type { PluginInfo, MdNode, PluginContext } from '@techie_doubts/tui.editor.2026';
import Chart, {
  BaseOptions,
  LineChart,
  AreaChart,
  BarChart,
  PieChart,
  ColumnChart,
  ScatterChart,
  RadarChart,
} from '@techie_doubts/tui.chart.2026';
import { PluginOptions } from '@t/index';
import csv from './csv';
import { trimKeepingTabs, isNumeric, clamp } from './util';

// csv configuration
csv.IGNORE_QUOTE_WHITESPACE = false;
csv.IGNORE_RECORD_LENGTH = true;
csv.DETECT_TYPES = false;

const reEOL = /[\n\r]/;
const reGroupByDelimiter = /([^:]+)?:?(.*)/;
const DEFAULT_DELIMITER = /\s+/;
const DELIMITERS = [',', '\t'];
const MINIMUM_DELIM_CNT = 2;
const SUPPORTED_CHART_TYPES = ['bar', 'column', 'line', 'area', 'pie', 'scatter', 'radar'];
const SERIES_THEME_TYPE_KEYS = [
  'line',
  'area',
  'column',
  'bar',
  'pie',
  'scatter',
  'bubble',
  'radar',
  'treemap',
  'heatmap',
  'boxPlot',
  'bullet',
  'gauge',
  'radialBar',
];
const CATEGORY_CHART_TYPES = ['line', 'area'];
const DEFAULT_DIMENSION_OPTIONS = {
  minWidth: 0,
  maxWidth: Infinity,
  minHeight: 0,
  maxHeight: Infinity,
  height: 'auto',
  width: 'auto',
};
const FALLBACK_CONTAINER_WIDTH = 600;
const DEFAULT_AUTO_CHART_WIDTH = 800;
const DEFAULT_CHART_ASPECT_RATIO_BY_TYPE: Record<string, number> = {
  bar: 1.7,
  column: 1.7,
  area: 1.7,
  line: 1.7,
  scatter: 4 / 3,
  pie: 1,
  radar: 1,
};
const RESERVED_KEYS = ['type', 'url'];
const TOOLTIP_FRACTION_DIGITS = 2;
const chart = {
  bar: Chart.barChart,
  column: Chart.columnChart,
  area: Chart.areaChart,
  line: Chart.lineChart,
  pie: Chart.pieChart,
  scatter: Chart.scatterChart,
  radar: Chart.radarChart,
};
const chartMap: Record<string, ChartInstance> = {};
const chartRenderVersionMap: Record<string, number> = {};
let effectiveDarkMode: boolean | null = null;
let chartStyleInjected = false;

const DARK_CHART_THEME = {
  chart: { backgroundColor: '#1a1a1a' },
  title: { color: '#e0e0e0' },
  xAxis: {
    title: { color: '#9ca3af' },
    label: { color: '#9ca3af' },
    color: '#4b5563',
  },
  yAxis: {
    title: { color: '#9ca3af' },
    label: { color: '#9ca3af' },
    color: '#4b5563',
  },
  legend: { label: { color: '#d1d5db' } },
  plot: {
    lineColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#1a1a1a',
  },
  tooltip: {
    background: '#2a2a2a',
    borderColor: '#4b5563',
    header: { color: '#e0e0e0' },
    body: { color: '#d1d5db' },
  },
};

function ensureChartStyles() {
  if (chartStyleInjected || typeof document === 'undefined') {
    return;
  }

  const style = document.createElement('style');

  style.setAttribute('data-toastui-chart-plugin', '1');
  style.textContent = `
.toastui-chart-block {
  text-align: center;
}

.toastui-chart-block > * {
  margin-left: auto;
  margin-right: auto;
}

.toastui-chart-block svg,
.toastui-chart-block canvas {
  max-width: 100%;
  height: auto;
}
  `.trim();

  document.head.appendChild(style);
  chartStyleInjected = true;
}

type ChartType = keyof typeof chart;
export type ChartOptions = BaseOptions & { editorChart: { type?: ChartType; url?: string } };
type ChartInstance =
  | BarChart
  | ColumnChart
  | AreaChart
  | LineChart
  | PieChart
  | ScatterChart
  | RadarChart;
type ChartCoordinatePoint = [string | number, number];
type ScatterPoint = { x: string | number; y: number; label?: string };
type ChartData = {
  categories: string[];
  series: {
    data: (number | null)[];
    name?: string;
  }[];
};
type ScatterChartData = {
  categories?: string[];
  series: {
    data: ScatterPoint[];
    name?: string;
  }[];
};
type RenderableChartData = {
  categories?: string[];
  series: {
    data: (number | null | ChartCoordinatePoint | ScatterPoint)[];
    name?: string;
    editorRawData?: (number | null)[];
  }[];
};
type ParsedChartData = ChartData | ScatterChartData;
type ParserCallback = (parsedInfo?: { data: ParsedChartData; options?: ChartOptions }) => void;
type OnSuccess = (res: { data: any }) => void;

export function parse(text: string, callback: ParserCallback) {
  text = trimKeepingTabs(text);
  const [firstTexts, secondTexts] = text.split(/\n{2,}/);
  const inlineOptions = parseToChartOption(firstTexts);
  const blockOptions = parseToChartOption(secondTexts);
  const dataOptions = Object.keys(blockOptions).length ? blockOptions : inlineOptions;
  const chartType = dataOptions?.editorChart?.type;
  const urlOptions = inlineOptions;
  const url = urlOptions?.editorChart?.url;

  // if first text is `options` and has `url` option, fetch data from url
  if (typeof url === 'string') {
    const success: OnSuccess = ({ data }) => {
      callback({ data: parseToChartData(data, chartType), options: inlineOptions });
    };
    const error = () => callback();

    fetch(url)
      .then((res) => res.text())
      .then((data) => success({ data }))
      .catch(() => error());
  } else {
    const options = blockOptions;
    const data = parseToChartData(firstTexts, chartType);

    callback({ data, options });
  }
}

export function detectDelimiter(text: string) {
  let delimiter: string | RegExp = DEFAULT_DELIMITER;
  let delimCnt = 0;

  text = trimKeepingTabs(text);

  DELIMITERS.forEach((delim) => {
    const matched = text.match(new RegExp(delim, 'g'))!;

    if (matched?.length > Math.max(MINIMUM_DELIM_CNT, delimCnt)) {
      delimiter = delim;
      delimCnt = matched.length;
    }
  });

  return delimiter;
}

function parseScatterValue(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : value;
}

function hasScatterHeader(firstRow: string[]) {
  if (firstRow.length < 2) {
    return false;
  }

  const xCandidate = firstRow.length >= 3 ? firstRow[1] : firstRow[0];
  const yCandidate = firstRow.length >= 3 ? firstRow[2] : firstRow[1];

  return !isNumeric(xCandidate) || !isNumeric(yCandidate);
}

function parseToScatterChartData(
  text: string,
  delimiter?: string | RegExp | null
): ScatterChartData {
  text = trimKeepingTabs(text);

  // @ts-ignore
  csv.COLUMN_SEPARATOR = delimiter || detectDelimiter(text);
  let dsv: string[][] = csv.parse(text);

  dsv = dsv
    .map((arr) => arr.map((val) => val.trim()))
    .filter((row) => row.some((value) => value.length));

  if (!dsv.length || !dsv[0]?.length) {
    return { series: [] };
  }

  if (hasScatterHeader(dsv[0])) {
    dsv.shift();
  }

  const points = dsv.reduce<ScatterPoint[]>((acc, row) => {
    const [first = '', second = '', third = ''] = row;
    let label: string | null = null;
    let xValue = '';
    let yValue = '';

    if (!isNumeric(first) && isNumeric(second) && isNumeric(third)) {
      label = first || null;
      xValue = second;
      yValue = third;
    } else if (isNumeric(first) && isNumeric(second)) {
      xValue = first;
      yValue = second;
      label = !isNumeric(third) && third ? third : null;
    } else {
      return acc;
    }

    const parsedYValue = Number(yValue);

    if (!Number.isFinite(parsedYValue)) {
      return acc;
    }

    acc.push({
      x: parseScatterValue(xValue),
      y: parsedYValue,
      ...(label ? { label } : {}),
    });

    return acc;
  }, []);

  return {
    series: [
      {
        name: 'Points',
        data: points,
      },
    ],
  };
}

export function parseToChartData(
  text: string,
  delimiterOrChartType?: string | RegExp | ChartType | null,
  chartType?: ChartType
) {
  let delimiter = delimiterOrChartType as string | RegExp | null;
  let resolvedChartType = chartType;

  if (
    typeof delimiterOrChartType === 'string' &&
    SUPPORTED_CHART_TYPES.includes(delimiterOrChartType) &&
    typeof chartType !== 'string'
  ) {
    resolvedChartType = delimiterOrChartType as ChartType;
    delimiter = null;
  }

  if (resolvedChartType === 'scatter') {
    return parseToScatterChartData(text, delimiter);
  }

  // trim all heading/trailing blank lines
  text = trimKeepingTabs(text);

  // @ts-ignore
  csv.COLUMN_SEPARATOR = delimiter || detectDelimiter(text);
  let dsv: string[][] = csv.parse(text);

  // trim all values in 2D array
  dsv = dsv.map((arr) => arr.map((val) => val.trim()));

  if (!dsv.length || !dsv[0]?.length) {
    return { categories: [], series: [] };
  }

  // test a first row for legends. ['anything', '1', '2', '3'] === false, ['anything', 't1', '2', 't3'] === true
  const hasLegends = dsv[0]
    .filter((_, i) => i > 0)
    .reduce((hasNaN, item) => hasNaN || !isNumeric(item), false);
  const legends = hasLegends ? dsv.shift()! : [];

  // Treat a leading empty legend cell (",seriesA,seriesB") as an explicit category column,
  // even when categories are numeric (0, 1, 2...).
  const hasLeadingLegendPlaceholder = hasLegends && (legends[0] || '') === '';
  // test a first column for categories
  const hasTextualCategories = dsv
    .slice(1)
    .reduce((hasNaN, row) => hasNaN || !isNumeric(row[0]), false);
  const hasCategories = hasLeadingLegendPlaceholder || hasTextualCategories;
  const categories = hasCategories ? dsv.map((arr) => arr.shift()!) : [];

  if (hasCategories) {
    legends.shift();
  }

  const columnCount = dsv.reduce((max, row) => Math.max(max, row.length), 0);
  const normalizedDsv =
    columnCount > 0
      ? dsv.map((row) => {
          const normalized = row.slice();

          while (normalized.length < columnCount) {
            normalized.push('');
          }

          return normalized;
        })
      : [];

  // transpose dsv, parse number
  // [['1','2','3']    [[1,4,7]
  //  ['4','5','6'] =>  [2,5,8]
  //  ['7','8','9']]    [3,6,9]]
  const tdsv = Array.from({ length: columnCount }, (_, i) =>
    normalizedDsv.map((x) => {
      const v = parseFloat(x[i]);

      return Number.isNaN(v) ? null : v;
    })
  );

  // make series
  const series = tdsv.map((data, i) =>
    hasLegends
      ? {
          name: legends[i],
          data,
        }
      : {
          data,
        }
  );

  return { categories, series };
}

function createOptionKeys(keyString: string) {
  const keys = keyString.trim().split('.');
  const [topKey] = keys;

  if (RESERVED_KEYS.indexOf(topKey) >= 0) {
    // reserved keys for chart plugin option
    keys.unshift('editorChart');
  } else if (keys.length === 1) {
    // short names for `chart`
    keys.unshift('chart');
  } else if (topKey === 'x' || topKey === 'y') {
    keys[0] = `${topKey}Axis`;

    const SCALE_KEYS = ['min', 'max', 'stepSize'];

    if (keys.length === 2 && SCALE_KEYS.indexOf(keys[1]) >= 0) {
      keys.splice(1, 0, 'scale');
    }
  }

  return keys;
}

export function parseToChartOption(text: string) {
  const options: Record<string, any> = {};

  if (typeof text !== 'undefined') {
    const lineTexts = text.split(reEOL);

    lineTexts.forEach((lineText) => {
      const matched = lineText.match(reGroupByDelimiter);

      if (matched) {
        // keyString can be nested object keys
        // ex) key1.key2.key3: value
        // eslint-disable-next-line prefer-const
        let [, keyString, value] = matched;

        if (value) {
          try {
            value = JSON.parse(value.trim());
          } catch (e) {
            value = value.trim();
          }

          const keys = createOptionKeys(keyString);
          let refOptions = options;

          keys.forEach((key, index) => {
            refOptions[key] = refOptions[key] || (keys.length - 1 === index ? value : {});
            // should change the ref option object to assign nested property
            refOptions = refOptions[key];
          });
        }
      }
    });
  }

  return options as ChartOptions;
}

function getAdjustedDimension(size: 'auto' | number, containerWidth: number) {
  return size === 'auto' ? Math.min(containerWidth, DEFAULT_AUTO_CHART_WIDTH) : size;
}

function getDefaultChartAspectRatio(chartType: string) {
  return DEFAULT_CHART_ASPECT_RATIO_BY_TYPE[chartType] || DEFAULT_CHART_ASPECT_RATIO_BY_TYPE.column;
}

function getAutoChartHeight(
  chartType: string,
  width: number,
  minHeight: number,
  maxHeight: number
) {
  const aspectRatio = getDefaultChartAspectRatio(chartType);

  return clamp(width / aspectRatio, minHeight, maxHeight);
}

function getRenderableContainerWidth(chartContainer: HTMLElement) {
  const ownWidth = chartContainer.getBoundingClientRect().width;

  if (ownWidth > 0) {
    return {
      width: ownWidth,
      isFallback: false,
    };
  }

  let parent = chartContainer.parentElement;

  while (parent) {
    const parentWidth = parent.getBoundingClientRect().width;

    if (parentWidth > 0) {
      return {
        width: parentWidth,
        isFallback: false,
      };
    }
    parent = parent.parentElement;
  }

  return {
    width: FALLBACK_CONTAINER_WIDTH,
    isFallback: true,
  };
}

function getChartDimension(
  chartOptions: ChartOptions,
  pluginOptions: PluginOptions,
  chartContainer: HTMLElement
) {
  const dimensionOptions = Object.assign({ ...DEFAULT_DIMENSION_OPTIONS }, pluginOptions);
  const { maxWidth, minWidth, maxHeight, minHeight } = dimensionOptions;
  const chartType = chartOptions.editorChart?.type || 'column';
  // if no width or height specified, set width and height to container width
  const { width: containerWidth, isFallback } = getRenderableContainerWidth(chartContainer);
  let { width = dimensionOptions.width, height = dimensionOptions.height } = chartOptions.chart!;

  width = getAdjustedDimension(width, containerWidth);
  height =
    height === 'auto'
      ? getAutoChartHeight(chartType, width, minHeight, maxHeight)
      : getAdjustedDimension(height, containerWidth);

  let adjustedWidth = clamp(width, minWidth, maxWidth);
  let adjustedHeight = clamp(height, minHeight, maxHeight);

  // Keep chart aspect ratio when explicit width is larger than the renderable
  // container width (common on mobile). Without this, some chart types can be
  // visually squeezed by CSS max-width while keeping a fixed height.
  if (!isFallback && containerWidth > 0 && adjustedWidth > containerWidth) {
    const scale = containerWidth / adjustedWidth;

    adjustedWidth = containerWidth;
    adjustedHeight *= scale;
  }

  return {
    width: clamp(adjustedWidth, minWidth, maxWidth),
    height: clamp(adjustedHeight, minHeight, maxHeight),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeChartOptions(
  baseOptions: Record<string, unknown> | undefined,
  overrideOptions: Record<string, unknown> | undefined
) {
  const base = isPlainObject(baseOptions) ? baseOptions : {};
  const override = isPlainObject(overrideOptions) ? overrideOptions : {};
  const merged: Record<string, unknown> = { ...base };

  Object.keys(override).forEach((key) => {
    const baseValue = merged[key];
    const overrideValue = override[key];

    merged[key] =
      isPlainObject(baseValue) && isPlainObject(overrideValue)
        ? mergeChartOptions(baseValue, overrideValue)
        : overrideValue;
  });

  return merged;
}

function getPluginChartOptions(pluginOptions: PluginOptions) {
  const { chartOptions } = pluginOptions as PluginOptions & { chartOptions?: ChartOptions };

  return isPlainObject(chartOptions) ? (chartOptions as Record<string, unknown>) : {};
}

function normalizeSeriesStyleKey(value: string) {
  const normalized = typeof value.normalize === 'function' ? value.normalize('NFKC') : value;

  return normalized
    .replace(/\uFEFF/g, '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function assignSeriesStyleByIndex(chartOptions: ChartOptions, chartData?: ParsedChartData) {
  if (!chartData || !isPlainObject(chartOptions.series)) {
    return;
  }

  const seriesOptions = chartOptions.series as Record<string, unknown>;

  if (!isPlainObject(seriesOptions.styles)) {
    return;
  }

  const styles = seriesOptions.styles as Record<string, unknown>;
  const indexBySeriesName = new Map<string, number>();

  (chartData.series as Array<{ name?: string }>).forEach((seriesItem, seriesIndex: number) => {
    if (typeof seriesItem?.name === 'string' && seriesItem.name.trim()) {
      indexBySeriesName.set(normalizeSeriesStyleKey(seriesItem.name), seriesIndex);
    }
  });

  Object.keys(styles).forEach((styleKey) => {
    if (/^\d+$/.test(styleKey.trim())) {
      return;
    }

    const seriesIndex = indexBySeriesName.get(normalizeSeriesStyleKey(styleKey));

    if (typeof seriesIndex !== 'number') {
      return;
    }

    const indexKey = String(seriesIndex);

    if (typeof styles[indexKey] === 'undefined') {
      styles[indexKey] = styles[styleKey];
    }
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function applyScatterLegendDefaults(chartOptions: ChartOptions, chartData?: ParsedChartData) {
  if (chartOptions.editorChart?.type !== 'scatter') {
    return;
  }

  const scatterData = chartData as ScatterChartData | undefined;
  const series = scatterData?.series || [];
  const isSingleSeries = series.length === 1;
  const firstSeriesName = typeof series[0]?.name === 'string' ? series[0].name.trim() : '';
  const isDefaultSinglePoints =
    isSingleSeries && (!firstSeriesName || firstSeriesName === 'Points');

  if (!isDefaultSinglePoints) {
    return;
  }

  if (!isPlainObject(chartOptions.legend)) {
    chartOptions.legend = { visible: false };

    return;
  }

  const legendOptions = chartOptions.legend as Record<string, unknown>;

  if (typeof legendOptions.visible === 'undefined') {
    legendOptions.visible = false;
  }
}

function hasOnlyIsolatedPoints(seriesData: (number | null)[]) {
  let hasValue = false;
  let previousWasValue = false;

  for (let i = 0; i < seriesData.length; i += 1) {
    const currentIsValue = isFiniteNumber(seriesData[i]);

    if (!currentIsValue) {
      previousWasValue = false;
      continue;
    }

    hasValue = true;

    if (previousWasValue) {
      return false;
    }

    previousWasValue = true;
  }

  return hasValue;
}

function applySparseSeriesVisibilityFallback(
  chartOptions: ChartOptions,
  chartData?: ParsedChartData
) {
  const chartType = chartOptions.editorChart?.type;

  if (!chartData || (chartType !== 'line' && chartType !== 'area')) {
    return;
  }

  const categoryChartData = chartData as ChartData;
  const hasSparseOnlySeries = categoryChartData.series.some((seriesItem) =>
    hasOnlyIsolatedPoints(seriesItem.data)
  );

  if (!hasSparseOnlySeries) {
    return;
  }

  if (!isPlainObject(chartOptions.series)) {
    chartOptions.series = {};
  }

  const seriesOptions = chartOptions.series as Record<string, unknown>;

  if (typeof seriesOptions.showDot === 'undefined') {
    seriesOptions.showDot = true;
  }
}

function shouldBreakLineOnNull(chartOptions: ChartOptions) {
  if (!isPlainObject(chartOptions.series)) {
    return false;
  }

  const seriesOptions = chartOptions.series as Record<string, unknown>;

  if (typeof seriesOptions.breakOnNull === 'boolean') {
    return seriesOptions.breakOnNull;
  }

  if (typeof seriesOptions.connectNulls === 'boolean') {
    return !seriesOptions.connectNulls;
  }

  return false;
}

function cleanLineGapOptions(chartOptions: ChartOptions) {
  if (!isPlainObject(chartOptions.series)) {
    return;
  }

  const seriesOptions = chartOptions.series as Record<string, unknown>;

  delete seriesOptions.breakOnNull;
  delete seriesOptions.connectNulls;
}

function buildCoordinateSeriesData(chartData: ChartData, seriesData: (number | null)[]) {
  const coordinateData: ChartCoordinatePoint[] = [];

  seriesData.forEach((value, index) => {
    if (!isFiniteNumber(value)) {
      return;
    }

    const categoryValue = chartData.categories[index];
    const numericCategoryValue = Number(categoryValue);
    let xValue: string | number = index;

    if (typeof categoryValue !== 'undefined') {
      xValue = Number.isFinite(numericCategoryValue) ? numericCategoryValue : categoryValue;
    }

    coordinateData.push([xValue, value]);
  });

  return coordinateData;
}

export function applyLineNullGapMode(
  chartOptions: ChartOptions,
  chartData?: ParsedChartData
): RenderableChartData | null {
  if (!chartData) {
    return null;
  }

  const chartType = chartOptions.editorChart?.type;

  if (chartType !== 'line' && chartType !== 'area') {
    cleanLineGapOptions(chartOptions);

    return chartData as RenderableChartData;
  }

  const categoryChartData = chartData as ChartData;

  const breakOnNull = shouldBreakLineOnNull(chartOptions);

  cleanLineGapOptions(chartOptions);

  if (breakOnNull) {
    (chartOptions as any).editorCategoryLabels = categoryChartData.categories;

    return categoryChartData;
  }

  const hasNullGap = categoryChartData.series.some((seriesItem) =>
    seriesItem.data.some((value) => value === null)
  );

  (chartOptions as any).editorCategoryLabels = categoryChartData.categories;

  if (!hasNullGap) {
    return categoryChartData;
  }

  if (!isPlainObject(chartOptions.series)) {
    chartOptions.series = {};
  }
  const seriesOptions = chartOptions.series as Record<string, unknown>;

  if (typeof seriesOptions.eventDetectType === 'undefined') {
    // Keep near detection so tooltip is anchored close to cursor/active marker
    // while plugin-level formatter resolves exact per-series values by X category.
    seriesOptions.eventDetectType = 'near';
  }

  const transformedSeries = categoryChartData.series.map((seriesItem) => {
    const rawData = seriesItem.data;

    return {
      ...seriesItem,
      editorRawData: rawData.map((value) => (isFiniteNumber(value) ? value : null)),
      data: buildCoordinateSeriesData(categoryChartData, rawData),
    };
  });

  const nextData: RenderableChartData = {
    ...categoryChartData,
    series: transformedSeries,
  };

  delete nextData.categories;

  return nextData;
}

function isCoordinateSeriesData(data: RenderableChartData) {
  const [firstSeries] = data.series;

  if (!firstSeries || !Array.isArray(firstSeries.data)) {
    return false;
  }

  const firstValue = firstSeries.data.find((value) => value !== null);

  return Array.isArray(firstValue);
}

function escapeHTML(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isNil(value: unknown): value is null | undefined {
  return value === null || typeof value === 'undefined';
}

type ThousandsMode = 'none' | 'locale' | 'custom';
type ThousandsOptions = { mode: ThousandsMode; separator?: string };

function isThousandsOptions(value: unknown): value is ThousandsOptions {
  return (
    isPlainObject(value) &&
    typeof (value as ThousandsOptions).mode === 'string' &&
    ['none', 'locale', 'custom'].includes((value as ThousandsOptions).mode)
  );
}

function resolveThousandsOptions(value: unknown): ThousandsOptions {
  if (typeof value === 'string') {
    return value.length ? { mode: 'custom', separator: value } : { mode: 'none' };
  }

  if (value === true || value === 1) {
    return { mode: 'locale' };
  }

  return { mode: 'none' };
}

function splitNumericText(value: string) {
  const matched = value.match(/^([+-]?)(\d+)(\.\d+)?$/);

  if (!matched) {
    return null;
  }

  return {
    sign: matched[1] || '',
    integer: matched[2],
    fraction: matched[3] || '',
  };
}

function applyCustomThousandsSeparator(value: string, separator: string) {
  const parts = splitNumericText(value);

  if (!parts) {
    return value;
  }

  return `${parts.sign}${parts.integer.replace(/\B(?=(\d{3})+(?!\d))/g, separator)}${
    parts.fraction
  }`;
}

function formatAxisValueWithThousands(value: string, options: ThousandsOptions) {
  if (options.mode === 'none') {
    return value;
  }

  if (options.mode === 'custom') {
    return applyCustomThousandsSeparator(value, options.separator || ' ');
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  const fractionMatched = value.match(/\.(\d+)$/);
  const fractionLength = fractionMatched ? fractionMatched[1].length : 0;

  return numericValue.toLocaleString([], {
    useGrouping: true,
    minimumFractionDigits: fractionLength,
    maximumFractionDigits: fractionLength,
  });
}

function inferThousandsOptionsFromFormatter(
  formatter: (value: string) => string
): ThousandsOptions {
  try {
    const probe = String(formatter('1000'));
    const matched = probe.match(/1([^0-9])000/);

    if (matched) {
      return { mode: 'custom', separator: matched[1] };
    }
  } catch (error) {
    return { mode: 'none' };
  }

  return { mode: 'none' };
}

function getPrimaryAxisOptions(tooltipComponent: any, axisKey: 'xAxis' | 'yAxis') {
  const chartOptions = tooltipComponent?.store?.state?.options;
  const axisOptions = Array.isArray(chartOptions?.[axisKey])
    ? chartOptions[axisKey][0]
    : chartOptions?.[axisKey];

  return isPlainObject(axisOptions) ? (axisOptions as Record<string, unknown>) : null;
}

function formatTooltipAxisValue(
  axisKey: 'xAxis' | 'yAxis',
  value: unknown,
  tooltipComponent: any
): string {
  const axisOptions = getPrimaryAxisOptions(tooltipComponent, axisKey);

  if (!axisOptions) {
    return String(value ?? '');
  }

  const formatter = (axisOptions as any).label?.formatter;

  if (typeof formatter === 'function') {
    try {
      return String(formatter(String(value ?? '')));
    } catch (error) {
      return String(value ?? '');
    }
  }

  return String(value ?? '');
}

function getYAxisThousandsOptions(tooltipComponent: any): ThousandsOptions {
  const yAxisOptions = getPrimaryAxisOptions(tooltipComponent, 'yAxis');

  if (!yAxisOptions) {
    return { mode: 'none' };
  }

  const metadata = yAxisOptions.__editorThousands;

  if (isThousandsOptions(metadata)) {
    return metadata;
  }

  if (metadata === true) {
    return { mode: 'locale' };
  }

  const yAxisFormatter = (yAxisOptions as any).label?.formatter;

  if (typeof yAxisFormatter === 'function') {
    return inferThousandsOptionsFromFormatter(yAxisFormatter);
  }

  return { mode: 'none' };
}

function formatTooltipCategory(value: unknown, tooltipComponent: any) {
  return formatTooltipAxisValue('xAxis', value, tooltipComponent);
}

function getTooltipFontStyle(themePart: any) {
  if (!themePart || typeof themePart !== 'object') {
    return '';
  }

  const declarations: string[] = [];

  if (!isNil(themePart.fontWeight)) {
    declarations.push(`font-weight: ${themePart.fontWeight}`);
  }
  if (themePart.fontFamily) {
    declarations.push(`font-family: ${themePart.fontFamily}`);
  }
  if (!isNil(themePart.fontSize)) {
    declarations.push(`font-size: ${themePart.fontSize}px`);
  }
  if (themePart.color) {
    declarations.push(`color: ${themePart.color}`);
  }

  return declarations.join('; ');
}

function formatTooltipNumber(value: unknown, tooltipComponent: any): string {
  if (isPlainObject(value) && 'x' in value && 'y' in value) {
    const xValue = formatTooltipAxisValue('xAxis', (value as any).x, tooltipComponent);
    const yValue = formatTooltipAxisValue('yAxis', (value as any).y, tooltipComponent);

    if ('r' in value) {
      return `(${xValue}, ${yValue}), r: ${formatTooltipNumber(
        (value as any).r,
        tooltipComponent
      )}`;
    }

    return `(${xValue}, ${yValue})`;
  }

  const thousandsOptions = getYAxisThousandsOptions(tooltipComponent);

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (thousandsOptions.mode === 'locale') {
      return value.toLocaleString([], {
        useGrouping: true,
        minimumFractionDigits: TOOLTIP_FRACTION_DIGITS,
        maximumFractionDigits: TOOLTIP_FRACTION_DIGITS,
      });
    }

    const formatted = value.toFixed(TOOLTIP_FRACTION_DIGITS);

    if (thousandsOptions.mode === 'custom') {
      return applyCustomThousandsSeparator(formatted, thousandsOptions.separator || ' ');
    }

    return formatted;
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatTooltipNumber(item, tooltipComponent)).join(' - ');
  }

  return String(value ?? '');
}

function resolveScatterDataLabelFormatter(chartOptions: ChartOptions) {
  const chartType = chartOptions.editorChart?.type;

  if (chartType !== 'scatter') {
    return;
  }

  const seriesOptions = isPlainObject(chartOptions.series)
    ? (chartOptions.series as Record<string, any>)
    : null;
  const dataLabelOptionCandidates = [seriesOptions?.dataLabels, seriesOptions?.scatter?.dataLabels];

  dataLabelOptionCandidates.forEach((dataLabelOptions) => {
    if (!isPlainObject(dataLabelOptions)) {
      return;
    }

    if (dataLabelOptions.formatter === 'label') {
      dataLabelOptions.formatter = (_value: unknown, pointData?: { label?: string }) =>
        String(pointData?.label ?? '');
    }
  });
}

function normalizeSingleChartSeriesTheme(chartOptions: ChartOptions) {
  const chartType = chartOptions.editorChart?.type;

  if (!chartType) {
    return;
  }

  const themeOptions = (chartOptions as any).theme;

  if (!isPlainObject(themeOptions) || !isPlainObject(themeOptions.series)) {
    return;
  }

  const seriesTheme = themeOptions.series as Record<string, unknown>;
  const typedSeriesTheme = seriesTheme[chartType];

  if (!isPlainObject(typedSeriesTheme)) {
    return;
  }

  const flattenedSeriesTheme = Object.keys(seriesTheme).reduce<Record<string, unknown>>(
    (acc, key) => {
      if (!SERIES_THEME_TYPE_KEYS.includes(key)) {
        acc[key] = seriesTheme[key];
      }

      return acc;
    },
    {}
  );

  themeOptions.series = mergeChartOptions(
    flattenedSeriesTheme,
    typedSeriesTheme as Record<string, unknown>
  );
}

function getTooltipSeriesCollection(tooltipComponent: any) {
  const seriesState = tooltipComponent?.store?.state?.series;

  if (!seriesState || typeof seriesState !== 'object') {
    return [];
  }

  const supportedSeriesTypes = ['line', 'area', 'column', 'bar', 'scatter', 'bubble', 'radar'];

  for (const seriesType of supportedSeriesTypes) {
    const seriesCollection = seriesState[seriesType];

    if (Array.isArray(seriesCollection?.data) && seriesCollection.data.length) {
      return seriesCollection.data;
    }
  }

  return [];
}

function getTooltipModelCategoryIndex(model: any) {
  if (!Array.isArray(model?.data)) {
    return null;
  }

  const indexOwner = model.data.find((item: any) => Number.isInteger(item?.index));

  return indexOwner ? indexOwner.index : null;
}

function getTooltipCategoryLabel(model: any) {
  if (typeof model?.category === 'string' || typeof model?.category === 'number') {
    return model.category;
  }

  if (!Array.isArray(model?.data)) {
    return null;
  }

  const categoryOwner = model.data.find(
    (item: any) => typeof item?.category === 'string' || typeof item?.category === 'number'
  );

  return categoryOwner ? categoryOwner.category : null;
}

function parseLooseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/[\s,_]/g, '')
    .replace(/,/g, '.');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveTooltipCategoryIndex(tooltipComponent: any, model: any) {
  const optionCategoryLabels = tooltipComponent?.store?.state?.options?.editorCategoryLabels;
  const categoryLabel = getTooltipCategoryLabel(model);

  if (Array.isArray(optionCategoryLabels) && optionCategoryLabels.length && !isNil(categoryLabel)) {
    const numericCategoryLabel = parseLooseNumber(categoryLabel);
    const numericLabels = optionCategoryLabels.map((value: unknown) => parseLooseNumber(value));
    const hasNumericLabels = numericLabels.every((value) => Number.isFinite(value));

    if (Number.isFinite(numericCategoryLabel) && hasNumericLabels) {
      for (let index = numericLabels.length - 1; index >= 0; index -= 1) {
        if ((numericLabels[index] as number) <= (numericCategoryLabel as number)) {
          return index;
        }
      }

      return 0;
    }

    const resolvedIndex = optionCategoryLabels.findIndex(
      (labelValue: unknown) => String(labelValue) === String(categoryLabel)
    );

    if (resolvedIndex >= 0) {
      return resolvedIndex;
    }
  }

  return getTooltipModelCategoryIndex(model);
}

function getTooltipSeriesColor(colorValue: unknown) {
  if (Array.isArray(colorValue)) {
    const firstColor = colorValue.find((value) => typeof value === 'string' && value.trim());

    return firstColor || '#8ea0bf';
  }

  if (typeof colorValue === 'string' && colorValue.trim()) {
    return colorValue;
  }

  return '#8ea0bf';
}

function normalizeTooltipSeriesValue(rawValue: any): string | number | null {
  if (isNil(rawValue)) {
    return null;
  }

  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : null;
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();

    if (!trimmed) {
      return null;
    }

    const asNumber = Number(trimmed);

    return Number.isFinite(asNumber) ? asNumber : trimmed;
  }

  if (Array.isArray(rawValue)) {
    if (!rawValue.length) {
      return null;
    }

    if (rawValue.length >= 2) {
      const secondValue = normalizeTooltipSeriesValue(rawValue[1]);

      if (!isNil(secondValue)) {
        return secondValue;
      }
    }

    for (let index = rawValue.length - 1; index >= 0; index -= 1) {
      const candidate = normalizeTooltipSeriesValue(rawValue[index]);

      if (!isNil(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  if (typeof rawValue === 'object') {
    if ('y' in rawValue) {
      return normalizeTooltipSeriesValue(rawValue.y);
    }

    if ('value' in rawValue) {
      return normalizeTooltipSeriesValue(rawValue.value);
    }
  }

  return null;
}

export function getTooltipRawSeriesValue(seriesItem: any, categoryIndex: number) {
  if (Array.isArray(seriesItem?.editorRawData)) {
    return seriesItem.editorRawData[categoryIndex] ?? null;
  }

  if (Array.isArray(seriesItem?.rawData)) {
    return seriesItem.rawData[categoryIndex] ?? null;
  }

  return null;
}

function wrapTooltipTemplate(theme: any, headerMarkup: string, bodyMarkup: string) {
  const borderWidth = Number.isFinite(theme?.borderWidth) ? theme.borderWidth : 1;
  const borderStyle = theme?.borderStyle || 'solid';
  const borderColor = theme?.borderColor || '#d7dce8';
  const borderRadius = Number.isFinite(theme?.borderRadius) ? theme.borderRadius : 8;
  const background = theme?.background || '#ffffff';
  const containerStyle = `border: ${borderWidth}px ${borderStyle} ${borderColor};border-radius: ${borderRadius}px;background: ${background};`;

  return `<div class="td-chart-tooltip" style="${containerStyle}">${headerMarkup}${bodyMarkup}</div>`;
}

function buildFullSeriesTooltip(
  tooltipComponent: any,
  model: any,
  defaultTemplate: { header: string; body: string },
  theme: any
) {
  const seriesCollection = getTooltipSeriesCollection(tooltipComponent);
  const categoryIndex = resolveTooltipCategoryIndex(tooltipComponent, model);
  const optionCategoryLabels = tooltipComponent?.store?.state?.options?.editorCategoryLabels;

  if (!seriesCollection.length || isNil(categoryIndex) || categoryIndex < 0) {
    return wrapTooltipTemplate(theme, defaultTemplate?.header || '', defaultTemplate?.body || '');
  }

  const visibleModelSeries = new Map<number, any>();

  for (const tooltipData of model.data || []) {
    if (Number.isInteger(tooltipData?.seriesIndex)) {
      visibleModelSeries.set(tooltipData.seriesIndex, tooltipData);
    }
  }

  const seriesRows = seriesCollection
    .map((seriesItem: any, seriesIndex: number) => {
      const tooltipData = visibleModelSeries.get(seriesIndex);
      const label = tooltipData?.label || seriesItem?.name || `Series ${seriesIndex + 1}`;
      const color = getTooltipSeriesColor(tooltipData?.color ?? seriesItem?.color);
      const rawSeriesValue = getTooltipRawSeriesValue(seriesItem, categoryIndex);
      const hasRawData =
        Array.isArray(seriesItem?.editorRawData) || Array.isArray(seriesItem?.rawData);
      const rawValue = hasRawData ? rawSeriesValue : tooltipData?.value ?? rawSeriesValue;
      const normalizedValue = normalizeTooltipSeriesValue(rawValue);
      const valueMarkup = isNil(normalizedValue)
        ? '<span class="td-chart-tooltip-none">None</span>'
        : escapeHTML(formatTooltipNumber(normalizedValue, tooltipComponent));

      return `<div class="td-chart-tooltip-series">
        <span class="td-chart-series-name">
          <i class="td-chart-icon" style="background: ${escapeHTML(color)}"></i>
          <span class="td-chart-name">${escapeHTML(label)}</span>
        </span>
        <span class="td-chart-series-value">${valueMarkup}</span>
      </div>`;
    })
    .join('');

  const headerCategory =
    Array.isArray(optionCategoryLabels) && !isNil(categoryIndex) && categoryIndex >= 0
      ? optionCategoryLabels[categoryIndex]
      : model.category;
  const formattedHeaderCategory = formatTooltipCategory(headerCategory, tooltipComponent);
  const hasHeaderCategory = !isNil(headerCategory) && String(headerCategory).length > 0;
  const headerMarkup = hasHeaderCategory
    ? `<div class="td-chart-tooltip-category" style="${getTooltipFontStyle(
        theme?.header
      )}">${escapeHTML(formattedHeaderCategory)}</div>`
    : '';
  const bodyMarkup = `<div class="td-chart-tooltip-series-wrapper" style="${getTooltipFontStyle(
    theme?.body
  )}">${seriesRows}</div>`;

  return wrapTooltipTemplate(theme, headerMarkup, bodyMarkup);
}

export function setDefaultOptions(
  chartOptions: ChartOptions,
  pluginOptions: PluginOptions,
  chartContainer: HTMLElement,
  chartData?: ParsedChartData
) {
  chartOptions = (mergeChartOptions(
    getPluginChartOptions(pluginOptions),
    chartOptions as any
  ) as unknown) as ChartOptions;
  chartOptions = Object.assign(
    {
      editorChart: {},
      chart: {},
      exportMenu: {},
      tooltip: {},
    },
    chartOptions
  );

  const { width, height } = getChartDimension(chartOptions, pluginOptions, chartContainer);

  chartOptions.chart!.width = width;
  chartOptions.chart!.height = height;

  // default chart type
  chartOptions.editorChart.type = chartOptions.editorChart.type || 'column';
  const chartType = chartOptions.editorChart.type;

  applyScatterLegendDefaults(chartOptions, chartData);

  normalizeSingleChartSeriesTheme(chartOptions);

  // default visibility of export menu
  chartOptions.exportMenu!.visible = !!chartOptions.exportMenu!.visible;
  if (typeof chartOptions.tooltip!.transition === 'undefined') {
    chartOptions.tooltip!.transition = false;
  }
  if (chartType !== 'scatter' && typeof chartOptions.tooltip!.formatter !== 'function') {
    chartOptions.tooltip!.formatter = function formatter(value: unknown) {
      return formatTooltipNumber(value, this);
    };
  }
  if (chartType === 'scatter') {
    if (typeof chartOptions.tooltip!.formatter !== 'function') {
      chartOptions.tooltip!.formatter = function formatter(value: unknown) {
        return formatTooltipNumber(value, this);
      };
    }
  } else if (typeof chartOptions.tooltip!.template !== 'function') {
    chartOptions.tooltip!.template = function template(model, defaultTemplate, theme) {
      return buildFullSeriesTooltip(this, model, defaultTemplate, theme);
    };
  }

  (['xAxis', 'yAxis'] as const).forEach((axis) => {
    const axisOpts = (chartOptions as any)[axis];

    if (!axisOpts) {
      return;
    }

    const axisList = Array.isArray(axisOpts) ? axisOpts : [axisOpts];

    axisList.forEach((axisOption) => {
      if (!isPlainObject(axisOption)) {
        return;
      }

      const normalizedAxisOption = axisOption as Record<string, any>;
      const { suffix, thousands } = normalizedAxisOption as {
        suffix?: string;
        thousands?: unknown;
      };
      const thousandsOptions = resolveThousandsOptions(thousands);

      normalizedAxisOption.__editorThousands = thousandsOptions;

      delete normalizedAxisOption.suffix;
      delete normalizedAxisOption.thousands;

      if (suffix || thousandsOptions.mode !== 'none') {
        normalizedAxisOption.label = normalizedAxisOption.label || {};
        normalizedAxisOption.label.formatter = (value: string) => {
          let result = String(value);

          result = formatAxisValueWithThousands(result, thousandsOptions);

          if (suffix) {
            result = `${result}${suffix}`;
          }

          return result;
        };
      }
    });
  });

  resolveScatterDataLabelFormatter(chartOptions);
  assignSeriesStyleByIndex(chartOptions, chartData);
  applySparseSeriesVisibilityFallback(chartOptions, chartData);

  return chartOptions;
}

function isDarkMode(el: HTMLElement): boolean {
  const root = el.closest('.toastui-editor-defaultUI');

  return !!root?.classList.contains('toastui-editor-dark');
}

function destroyChart() {
  Object.keys(chartMap).forEach((id) => {
    const container = document.querySelector<HTMLElement>(`[data-chart-id="${id}"]`);

    if (!container) {
      chartMap[id].destroy();

      delete chartMap[id];
      delete chartRenderVersionMap[id];
    }
  });
}

function recoverChartRenderWhenVisible({
  id,
  text,
  usageStatistics,
  pluginOptions,
  chartContainer,
  expectedRenderVersion,
  attempt = 0,
}: {
  id: string;
  text: string;
  usageStatistics: boolean;
  pluginOptions: PluginOptions;
  chartContainer: HTMLElement;
  expectedRenderVersion: number;
  attempt?: number;
}) {
  if (attempt >= 16) {
    return;
  }

  requestAnimationFrame(() => {
    if (chartRenderVersionMap[id] !== expectedRenderVersion) {
      return;
    }

    if (!chartContainer.isConnected || chartContainer.getAttribute('data-chart-id') !== id) {
      return;
    }

    const { isFallback } = getRenderableContainerWidth(chartContainer);

    if (isFallback) {
      recoverChartRenderWhenVisible({
        id,
        text,
        usageStatistics,
        pluginOptions,
        chartContainer,
        expectedRenderVersion,
        attempt: attempt + 1,
      });
      return;
    }

    doRenderChart(id, text, usageStatistics, pluginOptions, chartContainer);
  });
}

function clearChartById(id: string, chartContainer?: HTMLElement) {
  const existed = chartMap[id];

  if (existed) {
    existed.destroy();
    delete chartMap[id];
  }

  if (chartContainer) {
    chartContainer.innerHTML = '';
  }
}

function doRenderChart(
  id: string,
  text: string,
  usageStatistics: boolean,
  pluginOptions: PluginOptions,
  chartContainer: HTMLElement
) {
  const renderVersion = (chartRenderVersionMap[id] || 0) + 1;

  chartRenderVersionMap[id] = renderVersion;
  chartContainer.setAttribute('data-chart-text', encodeURIComponent(text));
  clearChartById(id, chartContainer);

  try {
    parse(text, (parsedInfo) => {
      if (chartRenderVersionMap[id] !== renderVersion) {
        return;
      }
      if (!chartContainer.isConnected) {
        return;
      }
      if (chartContainer.getAttribute('data-chart-id') !== id) {
        return;
      }

      const { data, options } = parsedInfo || {};
      const chartOptions = setDefaultOptions(options!, pluginOptions, chartContainer, data);
      const adjustedData = applyLineNullGapMode(chartOptions, data);
      const chartType = chartOptions.editorChart.type!;
      const dark = effectiveDarkMode !== null ? effectiveDarkMode : isDarkMode(chartContainer);

      if (dark) {
        (chartOptions as any).theme = mergeChartOptions(
          (DARK_CHART_THEME as unknown) as Record<string, unknown>,
          ((chartOptions as any).theme || {}) as Record<string, unknown>
        );
      }

      if (
        !adjustedData ||
        (CATEGORY_CHART_TYPES.indexOf(chartType) > -1 &&
          !isCoordinateSeriesData(adjustedData) &&
          Array.isArray(adjustedData.categories) &&
          adjustedData.categories.length !== adjustedData.series[0].data.length)
      ) {
        chartContainer.innerHTML = 'invalid chart data';
        delete chartMap[id];
      } else if (SUPPORTED_CHART_TYPES.indexOf(chartType) < 0) {
        chartContainer.innerHTML = `invalid chart type. type: bar, column, line, area, pie, scatter, radar`;
        delete chartMap[id];
      } else {
        const toastuiChart = chart[chartType];

        chartOptions.usageStatistics = usageStatistics;
        // @ts-ignore
        chartMap[id] = toastuiChart({
          el: chartContainer,
          data: adjustedData as any,
          options: chartOptions,
        });

        const { isFallback } = getRenderableContainerWidth(chartContainer);

        if (isFallback) {
          recoverChartRenderWhenVisible({
            id,
            text,
            usageStatistics,
            pluginOptions,
            chartContainer,
            expectedRenderVersion: renderVersion,
          });
        }
      }
    });
  } catch (e) {
    chartContainer.innerHTML = 'invalid chart data';
    delete chartMap[id];
  }
}

function renderChart(
  id: string,
  text: string,
  usageStatistics: boolean,
  pluginOptions: PluginOptions,
  retryCount = 0
) {
  // should draw the chart after rendering container element
  const chartContainer = document.querySelector<HTMLElement>(`[data-chart-id="${id}"]`);

  if (!chartContainer) {
    if (retryCount < 8) {
      requestAnimationFrame(() => {
        renderChart(id, text, usageStatistics, pluginOptions, retryCount + 1);
      });
    }
    return;
  }

  destroyChart();

  doRenderChart(id, text, usageStatistics, pluginOptions, chartContainer);
}

function reRenderAllCharts(
  usageStatistics: boolean,
  pluginOptions: PluginOptions,
  forceDark: boolean
) {
  effectiveDarkMode = forceDark;

  const containers = document.querySelectorAll<HTMLElement>('[data-chart-id][data-chart-text]');

  containers.forEach((container) => {
    const id = container.getAttribute('data-chart-id')!;

    if (chartMap[id]) {
      chartMap[id].destroy();
      delete chartMap[id];
    }

    delete chartRenderVersionMap[id];
    container.innerHTML = '';

    const text = decodeURIComponent(container.getAttribute('data-chart-text')!);

    doRenderChart(id, text, usageStatistics, pluginOptions, container);
  });
}

function generateId() {
  return `chart-${Math.random().toString(36).substr(2, 10)}`;
}

function getEditorRoot(instance: any) {
  let elements: any = null;

  try {
    elements = instance.getEditorElements?.();
  } catch (e) {
    elements = null;
  }

  const selectors = ['.toastui-editor-defaultUI', '.td-editor-defaultUI'];

  return (selectors
    .map(
      (selector) => elements?.mdPreview?.closest(selector) || elements?.wwEditor?.closest(selector)
    )
    .find(Boolean) ||
    selectors.map((selector) => document.querySelector(selector)).find(Boolean) ||
    null) as HTMLElement | null;
}

function detectDarkMode(instance: any) {
  const root = getEditorRoot(instance);

  if (!root) {
    return false;
  }

  return (
    root.classList.contains('toastui-editor-dark') || root.classList.contains('td-editor-dark')
  );
}

/**
 * Chart plugin
 * @param {Object} context - plugin context for communicating with editor
 * @param {Object} options - chart options
 * @param {number} [options.minWidth=0] - minimum width
 * @param {number} [options.minHeight=0] - minimum height
 * @param {number} [options.maxWidth=Infinity] - maximum width
 * @param {number} [options.maxHeight=Infinity] - maximum height
 * @param {number|string} [options.width='auto'] - default width
 * @param {number|string} [options.height='auto'] - default height
 */
export default function chartPlugin(context: PluginContext, options: PluginOptions): PluginInfo {
  ensureChartStyles();
  const { usageStatistics = true } = context;
  const instance = context.instance as any;

  let scheduled = false;
  let pendingThemeOverride: boolean | null = null;
  let rootObserver: MutationObserver | null = null;
  let rootResizeObserver: ResizeObserver | null = null;
  let resizeFallbackHandler: (() => void) | null = null;
  let observedRoot: HTMLElement | null = null;
  let observedRootWidth = 0;

  const scheduleReRender = ({
    themeOverride,
    deferFrames = 1,
  }: { themeOverride?: boolean; deferFrames?: number } = {}) => {
    if (typeof themeOverride === 'boolean') {
      pendingThemeOverride = themeOverride;
    }

    if (scheduled) {
      return;
    }

    scheduled = true;

    const framesToWait = Math.max(1, deferFrames);
    let frameCount = 0;

    const run = () => {
      frameCount += 1;

      if (frameCount < framesToWait) {
        requestAnimationFrame(run);
        return;
      }

      scheduled = false;

      const resolvedDark =
        pendingThemeOverride !== null ? pendingThemeOverride : detectDarkMode(instance);

      pendingThemeOverride = null;
      effectiveDarkMode = resolvedDark;
      reRenderAllCharts(usageStatistics, options, resolvedDark);
    };

    requestAnimationFrame(run);
  };

  const bindThemeObserver = () => {
    if (rootObserver) {
      return;
    }

    const root = getEditorRoot(instance);

    if (!root) {
      return;
    }

    rootObserver = new MutationObserver(() => {
      const dark = detectDarkMode(instance);

      if (effectiveDarkMode !== dark) {
        scheduleReRender({ themeOverride: dark });
      }
    });

    rootObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
  };

  const bindResizeObserver = () => {
    const root = getEditorRoot(instance);

    if (!root) {
      return;
    }

    if (observedRoot === root && (rootResizeObserver || resizeFallbackHandler)) {
      return;
    }

    if (rootResizeObserver) {
      rootResizeObserver.disconnect();
      rootResizeObserver = null;
    }

    if (resizeFallbackHandler) {
      window.removeEventListener('resize', resizeFallbackHandler);
      resizeFallbackHandler = null;
    }

    observedRoot = root;
    observedRootWidth = Math.round(root.getBoundingClientRect().width);

    if (typeof ResizeObserver !== 'undefined') {
      rootResizeObserver = new ResizeObserver((entries) => {
        const nextWidth = Math.round(
          entries[0]?.contentRect?.width || observedRoot?.getBoundingClientRect().width || 0
        );

        if (Math.abs(nextWidth - observedRootWidth) >= 1) {
          observedRootWidth = nextWidth;
          scheduleReRender({ deferFrames: 2 });
        }
      });
      rootResizeObserver.observe(root);

      return;
    }

    resizeFallbackHandler = () => {
      const nextWidth = Math.round(observedRoot?.getBoundingClientRect().width || 0);

      if (Math.abs(nextWidth - observedRootWidth) >= 1) {
        observedRootWidth = nextWidth;
        scheduleReRender({ deferFrames: 2 });
      }
    };

    window.addEventListener('resize', resizeFallbackHandler);
  };

  context.eventEmitter.listen('changeTheme', (theme: unknown) => {
    if (theme === 'dark' || theme === 'light') {
      scheduleReRender({ themeOverride: theme === 'dark' });
      return;
    }

    scheduleReRender({ deferFrames: 2 });
  });
  context.eventEmitter.listen('changeMode', () => {
    bindThemeObserver();
    bindResizeObserver();
    scheduleReRender({ deferFrames: 2 });
  });
  context.eventEmitter.listen('load', () => {
    bindThemeObserver();
    bindResizeObserver();
    scheduleReRender({ deferFrames: 2 });
  });
  context.eventEmitter.listen('loadUI', () => {
    bindThemeObserver();
    bindResizeObserver();
    scheduleReRender({ deferFrames: 2 });
  });
  context.eventEmitter.listen('destroy', () => {
    if (rootObserver) {
      rootObserver.disconnect();
      rootObserver = null;
    }

    if (rootResizeObserver) {
      rootResizeObserver.disconnect();
      rootResizeObserver = null;
    }

    if (resizeFallbackHandler) {
      window.removeEventListener('resize', resizeFallbackHandler);
      resizeFallbackHandler = null;
    }

    observedRoot = null;
  });

  requestAnimationFrame(() => {
    bindThemeObserver();
    bindResizeObserver();
  });

  return {
    toHTMLRenderers: {
      chart(node: MdNode) {
        const id = generateId();
        const encodedText = encodeURIComponent(node.literal || '');

        requestAnimationFrame(() => {
          renderChart(id, node.literal!, usageStatistics, options);
        });
        return [
          {
            type: 'openTag',
            tagName: 'div',
            outerNewLine: true,
            attributes: {
              class: 'toastui-chart-block',
              'data-chart-id': id,
              'data-chart-text': encodedText,
            },
          },
          { type: 'closeTag', tagName: 'div', outerNewLine: true },
        ];
      },
    },
  };
}
