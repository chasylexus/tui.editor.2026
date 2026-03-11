import { expect, test } from '@playwright/test';

const nbsp = '\u00A0';
const longParagraphMarkdown = `1${nbsp.repeat(80)}2`;
const longTableMarkdown = `| A | B |
| - | - |
| x${nbsp.repeat(80)}y | z |`;
const combinedMarkdown = `${longParagraphMarkdown}

${longTableMarkdown}`;

async function openHarness(page) {
  await page.goto('/e2e/fixtures/e2e-harness.html');
  await page.waitForFunction(() => window.__HARNESS__ && window.__HARNESS__.isReady());
}

async function renderNarrowWysiwyg(page, markdown: string) {
  await page.evaluate((value) => window.__HARNESS__.setMarkdown(value), markdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));
  await page.evaluate(() => window.__HARNESS__.setHostWidth(220));
  await page.evaluate(() => window.__HARNESS__.waitForIdle(8));
}

function getWysiwygMetrics(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      '.toastui-editor-ww-container .toastui-editor-contents.ProseMirror'
    );
    const paragraph = root?.querySelector(':scope > p');
    const table = root?.querySelector('table');
    const textCell = Array.from(root?.querySelectorAll('td') || []).find((cell) =>
      cell.textContent?.includes('x')
    );
    const nbspRunCount = root?.querySelectorAll('.toastui-editor-nbsp-run').length || 0;
    const box = (el: Element | null) => {
      if (!el) {
        return null;
      }

      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(el as HTMLElement);

      return {
        width: rect.width,
        height: rect.height,
        scrollWidth: (el as HTMLElement).scrollWidth,
        clientWidth: (el as HTMLElement).clientWidth,
        whiteSpace: style.whiteSpace,
      };
    };

    return {
      nbspRunCount,
      root: box(root),
      paragraph: box(paragraph),
      table: box(table),
      textCell: box(textCell || null),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
  await page.setViewportSize({ width: 390, height: 900 });
});

test('keeps paragraph runs with NBSP unbroken in wysiwyg on a narrow viewport', async ({
  page,
}) => {
  await renderNarrowWysiwyg(page, longParagraphMarkdown);
  const metrics = await getWysiwygMetrics(page);

  expect(metrics.nbspRunCount).toBeGreaterThan(0);
  expect(metrics.root).not.toBeNull();
  expect(metrics.paragraph).not.toBeNull();
  expect(metrics.root!.scrollWidth).toBeGreaterThan(metrics.root!.clientWidth);
  expect(metrics.paragraph!.scrollWidth).toBeGreaterThan(metrics.paragraph!.clientWidth);
});

test('keeps table cell runs with NBSP unbroken in wysiwyg on a narrow viewport', async ({
  page,
}) => {
  await renderNarrowWysiwyg(page, longTableMarkdown);
  const metrics = await getWysiwygMetrics(page);

  expect(metrics.nbspRunCount).toBeGreaterThan(0);
  expect(metrics.root).not.toBeNull();
  expect(metrics.table).not.toBeNull();
  expect(metrics.textCell).not.toBeNull();
  expect(metrics.table!.width).toBeGreaterThan(metrics.root!.clientWidth);
  expect(metrics.textCell!.width).toBeGreaterThan(200);
});

test('preserves NBSP through markdown to wysiwyg to markdown roundtrip', async ({ page }) => {
  await renderNarrowWysiwyg(page, combinedMarkdown);
  const roundtrip = await page.evaluate(() => window.__HARNESS__.getMarkdown());
  const codePoints = Array.from(roundtrip).filter((ch) => ch === '\u00A0').length;
  const expectedCount = Array.from(combinedMarkdown).filter((ch) => ch === '\u00A0').length;

  expect(codePoints).toBe(expectedCount);
  expect(roundtrip).toContain(`1${nbsp.repeat(80)}2`);
  expect(roundtrip).toContain(`x${nbsp.repeat(80)}y`);
});

test('keeps table-cell editing stable when text includes NBSP runs', async ({ page }) => {
  await renderNarrowWysiwyg(page, longTableMarkdown);
  const target = await page.evaluate(() => window.__HARNESS__.focusByText('y', 1));

  expect(target).not.toBeNull();

  await page.keyboard.type('Q');
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const roundtrip = await page.evaluate(() => window.__HARNESS__.getMarkdown());

  expect(roundtrip).toContain(`x${nbsp.repeat(80)}yQ`);
});

test('pastes standalone NBSP in wysiwyg from plain text clipboard', async ({ page }) => {
  await page.evaluate(() => window.__HARNESS__.setMarkdown(''));
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));

  const result = await page.evaluate(() => window.__HARNESS__.pastePlainText('\u00A0'));

  expect(result.defaultPrevented).toBe(true);
  expect(result.markdown).toBe('\u00A0');
});

test('copies a selected NBSP from a table cell without turning it into a table fragment', async ({
  page,
}) => {
  await renderNarrowWysiwyg(page, `| A | B |\n| --- | --- |\n| ${nbsp} | x |`);
  const range = await page.evaluate(() => window.__HARNESS__.selectText('\u00A0', 0, 1));

  expect(range).not.toBeNull();

  const copied = await page.evaluate(() => window.__HARNESS__.copySelection());

  expect(copied.defaultPrevented).toBe(true);
  expect(copied.data['text/plain']).toBe('\u00A0');
  expect(copied.data['text/html']).toContain('&nbsp;');
  expect(copied.data['text/html']).not.toContain('<table');
});

test('pasting a copied NBSP over a selected table-cell NBSP keeps the table shape intact', async ({
  page,
}) => {
  await renderNarrowWysiwyg(page, `| A | B |\n| --- | --- |\n| ${nbsp} | x |`);

  const initialSelection = await page.evaluate(() => window.__HARNESS__.selectText('\u00A0', 0, 1));

  expect(initialSelection).not.toBeNull();

  const copied = await page.evaluate(() => window.__HARNESS__.copySelection());

  expect(copied.defaultPrevented).toBe(true);

  await page.evaluate(() => window.__HARNESS__.selectText('\u00A0', 0, 1));
  const pasted = await page.evaluate(
    (data) => window.__HARNESS__.pasteClipboard(data),
    copied.data
  );

  expect(pasted.defaultPrevented).toBe(true);
  expect(pasted.markdown.trimEnd()).toBe(`| A | B |\n| --- | --- |\n| ${nbsp} | x |`);
});
