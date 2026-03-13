import { expect, test } from '@playwright/test';

const lineChartMarkdown = `\`\`\`chart
,series a,series b
category 1,1.234,2.345
category 2,3.456,4.567

type: line
width: 700
height: 420
\`\`\``;

const autoSizedLineChartMarkdown = `\`\`\`chart
,series a,series b
category 1,1.234,2.345
category 2,3.456,4.567

type: line
\`\`\``;

const scatterChartMarkdown = `\`\`\`chart
Item,X,Y
G,5,5
M,5,4.5
A,4.5,5
Y,4,4
S,3.5,4
O,3.5,3
K,3,2.5
V,3.5,3.6
T,3.5,3.3

type: scatter
title: Position
width: 700
height: 420
x.title: Scale A
y.title: Scale B
x.min: 0
x.max: 5.5
y.min: 0
y.max: 5.5
series.dataLabels.visible: true
series.dataLabels.formatter: "label"
\`\`\``;

const radarChartMarkdown = `\`\`\`chart
,Alpha,Beta,Gamma
Speed,4.2,3.5,4.8
Quality,4.7,3.9,4.3
Cost,2.1,3.8,2.9
Reliability,4.4,3.7,4.6
UX,4.6,3.8,4.1

type: radar
title: Capability Profile
width: 720
height: 440
series.showDot: true
series.showArea: true
plot.type: spiderweb
verticalAxis.scale.max: 5
\`\`\``;

const tinyRadarChartMarkdown = `\`\`\`chart
,Alpha,Beta,Gamma
Speed,4.2,3.5,4.8
Quality,4.7,3.9,4.3
Cost,2.1,3.8,2.9
Reliability,4.4,3.7,4.6
UX,4.6,3.8,4.1

type: radar
title: Capability Profile
width: 72
height: 44
series.showDot: true
series.showArea: true
plot.type: spiderweb
verticalAxis.scale.max: 5
\`\`\``;

const largeRadarChartMarkdown = `\`\`\`chart
,Alpha,Beta,Gamma
Speed,4.2,3.5,4.8
Quality,4.7,3.9,4.3
Cost,2.1,3.8,2.9
Reliability,4.4,3.7,4.6
UX,4.6,3.8,4.1

type: radar
title: Capability Profile
width: 960
height: 640
series.showDot: true
series.showArea: true
plot.type: spiderweb
verticalAxis.scale.max: 5
\`\`\``;

async function openHarness(page) {
  await page.goto('/e2e/fixtures/e2e-harness.html');
  await page.waitForFunction(() => window.__HARNESS__ && window.__HARNESS__.isReady());
}

async function renderChart(page, markdown: string) {
  await page.evaluate((value) => window.__HARNESS__.setMarkdown(value), markdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));
  await page.evaluate(() => window.__HARNESS__.setTheme('dark'));
  await page.evaluate(() => window.__HARNESS__.setHostWidth(320));
  await page.waitForFunction(() => {
    const box = window.__HARNESS__.getChartBox();

    return !!box && box.chart.width > 0 && box.chart.height > 0;
  });

  return page.evaluate(() => window.__HARNESS__.getChartBox());
}

async function renderChartAtWidth(page, markdown: string, hostWidth: number) {
  await page.evaluate((value) => window.__HARNESS__.setMarkdown(value), markdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));
  await page.evaluate(() => window.__HARNESS__.setTheme('dark'));
  await page.evaluate((width) => window.__HARNESS__.setHostWidth(width), hostWidth);
  await page.waitForFunction(() => {
    const box = window.__HARNESS__.getChartBox();

    return !!box && box.chart.width > 0 && box.chart.height > 0;
  });

  return page.evaluate(() => window.__HARNESS__.getChartBox());
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
  await page.setViewportSize({ width: 390, height: 900 });
});

test('keeps line chart proportion on a narrow dark viewport', async ({ page }) => {
  const box = await renderChart(page, lineChartMarkdown);

  expect(box).not.toBeNull();
  expect(box.chart.width).toBeLessThanOrEqual(322);
  expect(box.chart.height).toBeLessThan(280);
  expect(box.ratio).toBeGreaterThan(1.1);
});

test('keeps scatter chart proportion on a narrow dark viewport', async ({ page }) => {
  const box = await renderChart(page, scatterChartMarkdown);

  expect(box).not.toBeNull();
  expect(box.chart.width).toBeLessThanOrEqual(322);
  expect(box.chart.height).toBeLessThan(300);
  expect(box.ratio).toBeGreaterThan(1.05);
});

test('keeps radar chart proportion on a narrow dark viewport', async ({ page }) => {
  const box = await renderChart(page, radarChartMarkdown);

  expect(box).not.toBeNull();
  expect(box.chart.width).toBeLessThanOrEqual(322);
  expect(box.chart.height).toBeLessThan(310);
  expect(box.ratio).toBeGreaterThan(1.0);
});

test('accepts a tiny radar chart size and keeps the editor responsive', async ({ page }) => {
  const box = await renderChart(page, tinyRadarChartMarkdown);

  expect(box).not.toBeNull();
  expect(box.chart.width).toBeLessThanOrEqual(80);
  expect(box.chart.height).toBeLessThanOrEqual(60);

  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));
  await page.evaluate(() =>
    window.__HARNESS__.setMarkdown(`${window.__HARNESS__.getMarkdown()}\n<!-- ok -->`)
  );
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));

  const updatedMarkdown = await page.evaluate(() => window.__HARNESS__.getMarkdown());

  expect(updatedMarkdown).toContain('width: 72');
  expect(updatedMarkdown).toContain('height: 44');
  expect(updatedMarkdown).toContain('<!-- ok -->');
});

test('allows a radar chart to grow when the markdown width and height increase', async ({
  page,
}) => {
  const box = await renderChartAtWidth(page, largeRadarChartMarkdown, 1200);

  expect(box).not.toBeNull();
  expect(box.chart.width).toBeGreaterThan(700);
  expect(box.chart.height).toBeGreaterThan(450);
});

test('caps auto-sized charts to a moderate default width on wide containers', async ({ page }) => {
  const box = await renderChartAtWidth(page, autoSizedLineChartMarkdown, 1400);

  expect(box).not.toBeNull();
  expect(box.chart.width).toBeGreaterThan(760);
  expect(box.chart.width).toBeLessThanOrEqual(805);
  expect(box.chart.height).toBeGreaterThan(300);
});
