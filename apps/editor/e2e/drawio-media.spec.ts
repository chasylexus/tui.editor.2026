import { expect, test } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

const drawioMarkdown = '![architecture](https://example.com/architecture.drawio =720x480)';
const localDrawioMarkdown =
  '![architecture](~/.tui.editor.2026/media/sample-drawio.drawio =720x480)';
const encodedSpaceSamplePath = path.join(
  os.homedir(),
  '.tui.editor.2026',
  'media',
  'sample drawio.drawio'
);
const encodedSpaceMarkdown = `![architecture](${encodedSpaceSamplePath.replace(
  / /g,
  '%20'
)} =720x480)`;

async function openHarness(page) {
  await page.goto('/e2e/fixtures/e2e-harness.html');
  await page.waitForFunction(() => window.__HARNESS__ && window.__HARNESS__.isReady());
}

test.beforeAll(() => {
  const samplePath = path.join(os.homedir(), '.tui.editor.2026', 'media', 'sample-drawio.drawio');

  fs.copyFileSync(samplePath, encodedSpaceSamplePath);
});

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test('renders draw.io references as viewer iframes in markdown preview', async ({ page }) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), drawioMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const iframe = page.locator('.toastui-editor-md-preview iframe.toastui-media-drawio');

  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('width', '720');
  await expect(iframe).toHaveAttribute('height', '480');
  await expect(iframe).toHaveAttribute('src', /viewer\.diagrams\.net/);
  await expect(iframe).toHaveAttribute(
    'src',
    /#Uhttps%3A%2F%2Fexample\.com%2Farchitecture\.drawio/
  );
});

test('renders draw.io references as viewer iframes in wysiwyg', async ({ page }) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), drawioMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));

  const iframe = page.locator('.toastui-editor-ww-container iframe.toastui-media-drawio');

  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('width', '720');
  await expect(iframe).toHaveAttribute('height', '480');
  await expect(iframe).toHaveAttribute('src', /viewer\.diagrams\.net/);
  await expect(iframe).toHaveAttribute(
    'src',
    /#Uhttps%3A%2F%2Fexample\.com%2Farchitecture\.drawio/
  );
});

test('renders same-origin draw.io references through the local viewer page in markdown preview', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), localDrawioMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const iframe = page.locator('.toastui-editor-md-preview iframe.toastui-media-drawio');

  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('width', '720');
  await expect(iframe).toHaveAttribute('height', '480');
  await expect(iframe).toHaveAttribute('src', /\/dist\/cdn\/td-drawio-viewer\.html\?/);
  await expect(iframe).toHaveAttribute(
    'src',
    /src=http%3A%2F%2F127\.0\.0\.1%3A8080%2F__local_media/
  );
});

test('renders same-origin draw.io references through the local viewer page in wysiwyg', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), localDrawioMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));

  const iframe = page.locator('.toastui-editor-ww-container iframe.toastui-media-drawio');

  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('width', '720');
  await expect(iframe).toHaveAttribute('height', '480');
  await expect(iframe).toHaveAttribute('src', /\/dist\/cdn\/td-drawio-viewer\.html\?/);
  await expect(iframe).toHaveAttribute(
    'src',
    /src=http%3A%2F%2F127\.0\.0\.1%3A8080%2F__local_media/
  );
});

test('fits same-origin draw.io content to the iframe without internal scroll overflow', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), localDrawioMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const iframeHandle = await page
    .locator('.toastui-editor-md-preview iframe.toastui-media-drawio')
    .elementHandle();
  const frame = await iframeHandle.contentFrame();

  await expect
    .poll(() =>
      frame.evaluate(() => {
        const { body, documentElement: html } = document;

        return {
          bodyOverflowX: body.scrollWidth - body.clientWidth,
          bodyOverflowY: body.scrollHeight - body.clientHeight,
          htmlOverflowX: html.scrollWidth - html.clientWidth,
          htmlOverflowY: html.scrollHeight - html.clientHeight,
        };
      })
    )
    .toEqual({
      bodyOverflowX: 0,
      bodyOverflowY: 0,
      htmlOverflowX: 0,
      htmlOverflowY: 0,
    });
});

test('shrinks draw.io iframe height proportionally on narrow containers', async ({ page }) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), localDrawioMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));
  await page.evaluate(() => window.__HARNESS__.setHostWidth(360));

  const iframe = page.locator('.toastui-editor-md-preview iframe.toastui-media-drawio');

  await expect
    .poll(async () => {
      const box = await iframe.boundingBox();

      if (!box) {
        return false;
      }

      const { width, height } = box;
      const ratio = width / height;

      return width < 520 && height < 340 && ratio > 1.45 && ratio < 1.65;
    })
    .toBe(true);
});

test('renders percent-encoded local filesystem paths with spaces for draw.io media', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), encodedSpaceMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const iframeHandle = await page
    .locator('.toastui-editor-md-preview iframe.toastui-media-drawio')
    .elementHandle();
  const frame = await iframeHandle.contentFrame();

  await expect
    .poll(() => frame.evaluate(() => document.body.textContent || ''))
    .not.toContain('File not found');
});
