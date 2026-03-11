import { devices, expect, test } from '@playwright/test';

const longMobileMarkdown = `# Mobile toolbar

Paragraph 1

Paragraph 2

Paragraph 3

Paragraph 4

Paragraph 5

Paragraph 6

Paragraph 7

Paragraph 8

Paragraph 9

Paragraph 10`;

async function openHarness(page) {
  await page.goto('/e2e/fixtures/e2e-harness.html');
  await page.waitForFunction(() => window.__HARNESS__ && window.__HARNESS__.isReady());
}

test.use({
  ...devices['iPhone 13'],
});

test.beforeEach(async ({ page }) => {
  await openHarness(page);
  await page.evaluate((value) => window.__HARNESS__.setMarkdown(value), longMobileMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));
  await page.evaluate(() => window.__HARNESS__.setHostWidth(240));
  await page.evaluate(() => window.__HARNESS__.waitForIdle(8));
});

test('pins the toolbar to the bottom on mobile and keeps it aligned with the editor root', async ({
  page,
}) => {
  const metrics = await page.evaluate(() => window.__HARNESS__.getMobileToolbarMetrics());

  expect(metrics.isMobile).toBe(true);
  expect(metrics.root).not.toBeNull();
  expect(metrics.toolbar).not.toBeNull();
  expect(metrics.main).not.toBeNull();
  expect(metrics.toolbar.position).toBe('fixed');
  expect(parseFloat(metrics.main.paddingBottom)).toBeGreaterThanOrEqual(metrics.toolbar.height - 1);
  expect(Math.abs(metrics.toolbar.left - metrics.root.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(metrics.toolbar.width - metrics.root.width)).toBeLessThanOrEqual(2);
});

test('keeps the mobile toolbar horizontally scrollable when the toolbar content is wider', async ({
  page,
}) => {
  const before = await page.evaluate(() => {
    const root = document.querySelector('.toastui-editor-mobile-device');

    if (root instanceof HTMLElement) {
      root.style.setProperty('--mobile-toolbar-width', '240px');
    }

    return window.__HARNESS__.getMobileToolbarMetrics();
  });

  expect(before.isMobile).toBe(true);
  expect(before.toolbar).not.toBeNull();
  expect(before.toolbar.scrollWidth).toBeGreaterThan(before.toolbar.clientWidth);

  const scrolled = await page.evaluate(() => {
    const toolbar = document.querySelector('.toastui-editor-mobile-device .toastui-editor-toolbar');

    if (!(toolbar instanceof HTMLElement)) {
      return 0;
    }

    toolbar.scrollLeft = 160;

    return toolbar.scrollLeft;
  });

  expect(scrolled).toBeGreaterThan(0);
});
