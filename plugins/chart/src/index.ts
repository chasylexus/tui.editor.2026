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
 * type: area                   => editorChart.type  (bar | column | line | area | pie)
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
const SUPPORTED_CHART_TYPES = ['bar', 'column', 'line', 'area', 'pie'];
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
const RESERVED_KEYS = ['type', 'url'];
const TOOLTIP_FRACTION_DIGITS = 2;
const chart = {
  bar: Chart.barChart,
  column: Chart.columnChart,
  area: Chart.areaChart,
  line: Chart.lineChart,
  pie: Chart.pieChart,
};
const chartMap: Record<string, ChartInstance> = {};
let effectiveDarkMode: boolean | null = null;

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

type ChartType = keyof typeof chart;
export type ChartOptions = BaseOptions & { editorChart: { type?: ChartType; url?: string } };
type ChartInstance = BarChart | ColumnChart | AreaChart | LineChart | PieChart;
type ChartData = {
  categories: string[];
  series: { data: (number | null)[]; name?: string }[];
};
type ParserCallback = (parsedInfo?: { data: ChartData; options?: ChartOptions }) => void;
type OnSuccess = (res: { data: any }) => void;

export function parse(text: string, callback: ParserCallback) {
  text = trimKeepingTabs(text);
  const [firstTexts, secondTexts] = text.split(/\n{2,}/);
  const urlOptions = parseToChartOption(firstTexts);
  const url = urlOptions?.editorChart?.url;

  // if first text is `options` and has `url` option, fetch data from url
  if (typeof url === 'string') {
    const success: OnSuccess = ({ data }) => {
      callback({ data: parseToChartData(data), options: parseToChartOption(firstTexts) });
    };
    const error = () => callback();

    fetch(url)
      .then((res) => res.text())
      .then((data) => success({ data }))
      .catch(() => error());
  } else {
    const data = parseToChartData(firstTexts);
    const options = parseToChartOption(secondTexts);

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

export function parseToChartData(text: string, delimiter?: string | RegExp) {
  // trim all heading/trailing blank lines
  text = trimKeepingTabs(text);

  // @ts-ignore
  csv.COLUMN_SEPARATOR = delimiter || detectDelimiter(text);
  let dsv: string[][] = csv.parse(text);

  // trim all values in 2D array
  dsv = dsv.map((arr) => arr.map((val) => val.trim()));

  // test a first row for legends. ['anything', '1', '2', '3'] === false, ['anything', 't1', '2', 't3'] === true
  const hasLegends = dsv[0]
    .filter((_, i) => i > 0)
    .reduce((hasNaN, item) => hasNaN || !isNumeric(item), false);
  const legends = hasLegends ? dsv.shift()! : [];

  // test a first column for categories
  const hasCategories = dsv.slice(1).reduce((hasNaN, row) => hasNaN || !isNumeric(row[0]), false);
  const categories = hasCategories ? dsv.map((arr) => arr.shift()!) : [];

  if (hasCategories) {
    legends.shift();
  }

  // transpose dsv, parse number
  // [['1','2','3']    [[1,4,7]
  //  ['4','5','6'] =>  [2,5,8]
  //  ['7','8','9']]    [3,6,9]]
  const tdsv = dsv[0].map((_, i) =>
    dsv.map((x) => {
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
  return size === 'auto' ? containerWidth : size;
}

function getRenderableContainerWidth(chartContainer: HTMLElement) {
  const ownWidth = chartContainer.getBoundingClientRect().width;

  if (ownWidth > 0) {
    return ownWidth;
  }

  let parent = chartContainer.parentElement;

  while (parent) {
    const parentWidth = parent.getBoundingClientRect().width;

    if (parentWidth > 0) {
      return parentWidth;
    }
    parent = parent.parentElement;
  }

  return FALLBACK_CONTAINER_WIDTH;
}

function getChartDimension(
  chartOptions: ChartOptions,
  pluginOptions: PluginOptions,
  chartContainer: HTMLElement
) {
  const dimensionOptions = Object.assign({ ...DEFAULT_DIMENSION_OPTIONS }, pluginOptions);
  const { maxWidth, minWidth, maxHeight, minHeight } = dimensionOptions;
  // if no width or height specified, set width and height to container width
  const containerWidth = getRenderableContainerWidth(chartContainer);
  let { width = dimensionOptions.width, height = dimensionOptions.height } = chartOptions.chart!;

  width = getAdjustedDimension(width, containerWidth);
  height = getAdjustedDimension(height, containerWidth);

  return {
    width: clamp(width, minWidth, maxWidth),
    height: clamp(height, minHeight, maxHeight),
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

function assignSeriesStyleByIndex(chartOptions: ChartOptions, chartData?: ChartData) {
  if (!chartData || !isPlainObject(chartOptions.series)) {
    return;
  }

  const seriesOptions = chartOptions.series as Record<string, unknown>;

  if (!isPlainObject(seriesOptions.styles)) {
    return;
  }

  const styles = seriesOptions.styles as Record<string, unknown>;
  const indexBySeriesName = new Map<string, number>();

  chartData.series.forEach((seriesItem, seriesIndex) => {
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

function getYAxisThousandsOptions(tooltipComponent: any): ThousandsOptions {
  const chartOptions = tooltipComponent?.store?.state?.options;
  const yAxisOptions = Array.isArray(chartOptions?.yAxis)
    ? chartOptions.yAxis[0]
    : chartOptions?.yAxis;

  if (!isPlainObject(yAxisOptions)) {
    return { mode: 'none' };
  }

  const metadata = (yAxisOptions as Record<string, unknown>).__editorThousands;

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

function getTooltipCategoryIndex(model: any) {
  if (!Array.isArray(model?.data)) {
    return null;
  }

  const indexOwner = model.data.find((item: any) => Number.isInteger(item?.index));

  return indexOwner ? indexOwner.index : null;
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
  const categoryIndex = getTooltipCategoryIndex(model);

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
      const rawSeriesValue = Array.isArray(seriesItem?.rawData)
        ? seriesItem.rawData[categoryIndex]
        : null;
      const rawValue = tooltipData?.value ?? rawSeriesValue;
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

  const headerMarkup = model.category
    ? `<div class="td-chart-tooltip-category" style="${getTooltipFontStyle(
        theme?.header
      )}">${escapeHTML(model.category)}</div>`
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
  chartData?: ChartData
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
  // default visibility of export menu
  chartOptions.exportMenu!.visible = !!chartOptions.exportMenu!.visible;
  if (typeof chartOptions.tooltip!.transition === 'undefined') {
    chartOptions.tooltip!.transition = false;
  }
  if (typeof chartOptions.tooltip!.formatter !== 'function') {
    chartOptions.tooltip!.formatter = function formatter(value: unknown) {
      return formatTooltipNumber(value, this);
    };
  }
  if (typeof chartOptions.tooltip!.template !== 'function') {
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

  assignSeriesStyleByIndex(chartOptions, chartData);

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
    }
  });
}

function doRenderChart(
  id: string,
  text: string,
  usageStatistics: boolean,
  pluginOptions: PluginOptions,
  chartContainer: HTMLElement
) {
  chartContainer.setAttribute('data-chart-text', encodeURIComponent(text));

  try {
    parse(text, (parsedInfo) => {
      const { data, options } = parsedInfo || {};
      const chartOptions = setDefaultOptions(options!, pluginOptions, chartContainer, data);
      const chartType = chartOptions.editorChart.type!;
      const dark = effectiveDarkMode !== null ? effectiveDarkMode : isDarkMode(chartContainer);

      if (dark) {
        (chartOptions as any).theme = DARK_CHART_THEME;
      }

      if (
        !data ||
        (CATEGORY_CHART_TYPES.indexOf(chartType) > -1 &&
          data.categories.length !== data.series[0].data.length)
      ) {
        chartContainer.innerHTML = 'invalid chart data';
      } else if (SUPPORTED_CHART_TYPES.indexOf(chartType) < 0) {
        chartContainer.innerHTML = `invalid chart type. type: bar, column, line, area, pie`;
      } else {
        const toastuiChart = chart[chartType];

        chartOptions.usageStatistics = usageStatistics;
        // @ts-ignore
        chartMap[id] = toastuiChart({ el: chartContainer, data, options: chartOptions });
      }
    });
  } catch (e) {
    chartContainer.innerHTML = 'invalid chart data';
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
  const { usageStatistics = true } = context;
  const instance = context.instance as any;

  let scheduled = false;
  let pendingThemeOverride: boolean | null = null;
  let rootObserver: MutationObserver | null = null;

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

  context.eventEmitter.listen('changeTheme', (theme: unknown) => {
    if (theme === 'dark' || theme === 'light') {
      scheduleReRender({ themeOverride: theme === 'dark' });
      return;
    }

    scheduleReRender({ deferFrames: 2 });
  });
  context.eventEmitter.listen('changeMode', () => {
    bindThemeObserver();
    scheduleReRender({ deferFrames: 2 });
  });
  context.eventEmitter.listen('load', () => {
    bindThemeObserver();
    scheduleReRender({ deferFrames: 2 });
  });
  context.eventEmitter.listen('loadUI', () => {
    bindThemeObserver();
    scheduleReRender({ deferFrames: 2 });
  });

  requestAnimationFrame(() => {
    bindThemeObserver();
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
            attributes: { 'data-chart-id': id, 'data-chart-text': encodedText },
          },
          { type: 'closeTag', tagName: 'div', outerNewLine: true },
        ];
      },
    },
  };
}
