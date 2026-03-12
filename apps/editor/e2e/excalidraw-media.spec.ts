import { expect, test } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

const EXCALIDRAW_RENDER_TIMEOUT = 15000;

const localSamplePath = path.join(os.homedir(), '.tui.editor.2026', 'media', 'sample.excalidraw');
const localExcalidrawMarkdown = `![scene](${localSamplePath.replace(/ /g, '%20')} =720x480)`;
const encodedSpaceSamplePath = path.join(
  os.homedir(),
  '.tui.editor.2026',
  'media',
  'sample scene.excalidraw'
);
const encodedSpaceMarkdown = `![scene](${encodedSpaceSamplePath.replace(/ /g, '%20')} =720x480)`;
const sharedSceneMarkdown =
  '![scene](https://excalidraw.com/#json=glMnmZysKTWg1cwvDo9G2,dDHbdibyTtlUutZgfNfMKw =800x600)';

async function openHarness(page) {
  await page.goto('/e2e/fixtures/e2e-harness.html');
  await page.waitForFunction(() => window.__HARNESS__ && window.__HARNESS__.isReady());
}

test.beforeAll(() => {
  const targetDir = path.join(os.homedir(), '.tui.editor.2026', 'media');
  const samplePath = path.join(targetDir, 'sample.excalidraw');
  const sampleScene = {
    type: 'excalidraw',
    version: 2,
    source: 'https://excalidraw.com',
    elements: [
      {
        id: 'rect-1',
        type: 'rectangle',
        x: 48,
        y: 36,
        width: 180,
        height: 96,
        angle: 0,
        strokeColor: '#1f2937',
        backgroundColor: 'transparent',
        fillStyle: 'hachure',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
      },
    ],
    appState: {
      viewBackgroundColor: '#ffffff',
    },
    files: {},
  };

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(samplePath, JSON.stringify(sampleScene, null, 2));
  fs.copyFileSync(samplePath, encodedSpaceSamplePath);
});

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test('renders same-origin excalidraw references through the local viewer page in markdown preview', async ({
  page,
}) => {
  await page.evaluate(
    (markdown) => window.__HARNESS__.setMarkdown(markdown),
    localExcalidrawMarkdown
  );
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const iframe = page.locator('.toastui-editor-md-preview iframe.toastui-media-excalidraw');

  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('width', '720');
  await expect(iframe).toHaveAttribute('height', '480');
  await expect(iframe).toHaveAttribute('src', /\/dist\/cdn\/td-excalidraw-viewer\.html\?/);

  const frameHandle = await iframe.elementHandle();
  const frame = await frameHandle!.contentFrame();

  await expect.poll(() => frame!.locator('#root svg').count(), { timeout: EXCALIDRAW_RENDER_TIMEOUT }).toBe(1);
});

test('renders same-origin excalidraw references through the local viewer page in wysiwyg', async ({
  page,
}) => {
  await page.evaluate(
    (markdown) => window.__HARNESS__.setMarkdown(markdown),
    localExcalidrawMarkdown
  );
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));

  const iframe = page.locator('.toastui-editor-ww-container iframe.toastui-media-excalidraw');

  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('width', '720');
  await expect(iframe).toHaveAttribute('height', '480');
  await expect(iframe).toHaveAttribute('src', /\/dist\/cdn\/td-excalidraw-viewer\.html\?/);

  const frameHandle = await iframe.elementHandle();
  const frame = await frameHandle!.contentFrame();

  await expect.poll(() => frame!.locator('#root svg').count(), { timeout: EXCALIDRAW_RENDER_TIMEOUT }).toBe(1);
});

test('renders percent-encoded local filesystem paths with spaces for excalidraw media', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), encodedSpaceMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const iframe = page.locator('.toastui-editor-md-preview iframe.toastui-media-excalidraw');
  const frameHandle = await iframe.elementHandle();
  const frame = await frameHandle!.contentFrame();

  await expect.poll(() => frame!.locator('#root svg').count(), { timeout: EXCALIDRAW_RENDER_TIMEOUT }).toBe(1);
  await expect.poll(() => frame!.locator('#status').textContent(), { timeout: EXCALIDRAW_RENDER_TIMEOUT }).not.toContain('Failed');
});

test('respects explicit excalidraw size changes in markdown preview', async ({ page }) => {
  await page.evaluate(
    (markdown) => window.__HARNESS__.setMarkdown(markdown),
    `![scene](${localSamplePath.replace(/ /g, '%20')} =720x480)`
  );
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const iframe = page.locator('.toastui-editor-md-preview iframe.toastui-media-excalidraw');
  const firstBox = await iframe.boundingBox();

  await page.evaluate(
    (markdown) => window.__HARNESS__.setMarkdown(markdown),
    `![scene](${localSamplePath.replace(/ /g, '%20')} =800x600)`
  );

  await expect(iframe).toHaveAttribute('width', '800');
  await expect(iframe).toHaveAttribute('height', '600');

  const updatedBox = await iframe.boundingBox();

  expect(firstBox).not.toBeNull();
  expect(updatedBox).not.toBeNull();
  expect(updatedBox!.height).toBeGreaterThan(firstBox!.height + 8);
});

test('crops local excalidraw scenes to content bounds instead of keeping large left whitespace', async ({
  page,
}) => {
  await page.evaluate(
    (markdown) => window.__HARNESS__.setMarkdown(markdown),
    localExcalidrawMarkdown
  );
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const iframeHandle = await page
    .locator('.toastui-editor-md-preview iframe.toastui-media-excalidraw')
    .elementHandle();
  const frame = await iframeHandle!.contentFrame();

  await expect.poll(() => frame!.locator('#root svg').count(), { timeout: EXCALIDRAW_RENDER_TIMEOUT }).toBe(1);

  const geometry = await frame!.evaluate(() => {
    const svg = document.querySelector('#root svg');
    const body = document.body;
    const root = document.getElementById('root');

    if (!svg || !body || !root) {
      return null;
    }

    const svgRect = svg.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();

    return {
      bodyHeight: bodyRect.height,
      rootHeight: rootRect.height,
      scrollHeight: body.scrollHeight,
      svgHeight: svgRect.height,
      svgWidth: svgRect.width,
      viewBox: svg.getAttribute('viewBox'),
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.viewBox).not.toBe('0 0 204 120');
  expect(geometry!.scrollHeight).toBeLessThanOrEqual(Math.ceil(geometry!.bodyHeight) + 1);
  expect(geometry!.svgHeight).toBeLessThanOrEqual(geometry!.bodyHeight + 1);
  expect(geometry!.rootHeight).toBeLessThanOrEqual(geometry!.bodyHeight + 1);
});

test('renders Excalidraw #json share links through the local viewer and honors explicit size', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), sharedSceneMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const iframe = page.locator('.toastui-editor-md-preview iframe.toastui-media-excalidraw');

  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('width', '800');
  await expect(iframe).toHaveAttribute('height', '600');
  await expect(iframe).toHaveAttribute('src', /\/dist\/cdn\/td-excalidraw-viewer\.html\?/);

  const frameHandle = await iframe.elementHandle();
  const frame = await frameHandle!.contentFrame();

  await expect.poll(() => frame!.locator('#root svg').count(), { timeout: EXCALIDRAW_RENDER_TIMEOUT }).toBe(1);
  await expect.poll(() => frame!.locator('#status').textContent(), { timeout: EXCALIDRAW_RENDER_TIMEOUT }).not.toContain('Failed');

  const geometry = await frame!.evaluate(() => {
    const svg = document.querySelector('#root svg');
    const body = document.body;

    if (!svg || !body) {
      return null;
    }

    const svgRect = svg.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();

    return {
      bodyHeight: bodyRect.height,
      scrollHeight: body.scrollHeight,
      svgHeight: svgRect.height,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.scrollHeight).toBeLessThanOrEqual(Math.ceil(geometry!.bodyHeight) + 1);
  expect(geometry!.svgHeight).toBeLessThanOrEqual(geometry!.bodyHeight + 1);
});

test('keeps the Excalidraw share-link SVG bbox inside the final cropped viewBox', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), sharedSceneMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const iframe = page.locator('.toastui-editor-md-preview iframe.toastui-media-excalidraw');
  const frameHandle = await iframe.elementHandle();
  const frame = await frameHandle!.contentFrame();

  await expect.poll(() => frame!.locator('#root svg').count()).toBe(1);

  const geometry = await frame!.evaluate(() => {
    const svg = document.querySelector('#root svg');

    if (!svg || typeof svg.getBBox !== 'function') {
      return null;
    }

    const bbox = svg.getBBox();
    const viewBox = String(svg.getAttribute('viewBox') || '')
      .trim()
      .split(/\s+/)
      .map((part) => Number.parseFloat(part));

    if (viewBox.length !== 4 || viewBox.some((part) => !Number.isFinite(part))) {
      return null;
    }

    const [x, y, width, height] = viewBox;

    return {
      bbox: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
      viewBox: { x, y, width, height },
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.viewBox.x).toBeLessThanOrEqual(geometry!.bbox.x - 10);
  expect(geometry!.viewBox.y).toBeLessThanOrEqual(geometry!.bbox.y - 10);
  expect(geometry!.bbox.x + geometry!.bbox.width).toBeLessThanOrEqual(
    geometry!.viewBox.x + geometry!.viewBox.width + 0.5
  );
  expect(geometry!.bbox.y + geometry!.bbox.height).toBeLessThanOrEqual(
    geometry!.viewBox.y + geometry!.viewBox.height + 0.5
  );
});
