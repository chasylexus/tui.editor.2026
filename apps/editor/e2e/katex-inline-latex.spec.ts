import { expect, test } from '@playwright/test';

const gammaMarkdown = `* The *Gamma function*: $\\Gamma(n) = \\begin{cases}
  \\displaystyle (n-1)!\\quad\\forall n\\in\\mathbb N\\\\
  \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+
  \\end{cases}$`;

const inlineMathMarkdown = [
  "* The Euler's identity: $e^{i\\pi} + 1 = 0$",
  '* The solution of $f(x)=ax^2+bx+c$ where $a \\neq 0$ and $a, b, c \\in R$ is not',
].join('\n');

async function openHarness(page) {
  await page.goto('/examples/e2e-harness.html');
  await page.waitForFunction(() => window.__HARNESS__ && window.__HARNESS__.isReady());
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test('keeps multiline inline latex stable across repeated edits in the first displaystyle line', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), gammaMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));
  await page.evaluate(() => window.__HARNESS__.focusByText('(n-1)!', '(n-1'.length));
  await page.keyboard.type('11');

  const markdown = await page.evaluate(() => window.__HARNESS__.getMarkdown());
  const state = await page.evaluate(() => window.__HARNESS__.getInlineLatexState());

  expect(markdown).toContain('(n-111)!');
  expect(markdown).toContain('\\mathbb N\\\\\n');
  expect(markdown).toContain('\n    \\displaystyle \\int_0^\\infty');
  expect(markdown).toContain('\n    \\end{cases}$');
  expect(state.breakCount).toBe(3);
  expect(state.previewTop).not.toBeNull();
  expect(state.previewTop).toBeGreaterThan(0);
  expect(state.selection.from).toBeLessThan(state.state.editRange.to - 10);
});

test('keeps multiline inline latex stable when repeatedly editing the function argument line', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), gammaMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));
  await page.evaluate(() => window.__HARNESS__.focusByText('\\Gamma(n)', '\\Gamma(n'.length));
  await page.keyboard.type('mm');

  const markdown = await page.evaluate(() => window.__HARNESS__.getMarkdown());
  const state = await page.evaluate(() => window.__HARNESS__.getInlineLatexState());

  expect(markdown).toContain('\\Gamma(nmm)');
  expect(markdown).toContain('\n    \\displaystyle (n-1)!');
  expect(markdown).toContain('\n    \\displaystyle \\int_0^\\infty');
  expect(state.breakCount).toBe(3);
});

test('keeps multiline inline latex stable when editing the third line payload', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), gammaMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));
  await page.evaluate(() => window.__HARNESS__.focusByText('t^{n-1}', 't^{n-1'.length));
  await page.keyboard.type('1');

  const markdown = await page.evaluate(() => window.__HARNESS__.getMarkdown());
  const state = await page.evaluate(() => window.__HARNESS__.getInlineLatexState());

  expect(markdown).toContain('t^{n-11}');
  expect(markdown).toContain('\n    \\end{cases}$');
  expect(state.breakCount).toBe(3);
});

test('does not over-escape inline latex when editing adjacent plain text then switching to markdown', async ({
  page,
}) => {
  await page.evaluate((markdown) => window.__HARNESS__.setMarkdown(markdown), inlineMathMarkdown);
  await page.evaluate(() => window.__HARNESS__.changeMode('wysiwyg'));
  await page.evaluate(() => window.__HARNESS__.focusByText('not', 'not'.length));
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.evaluate(() => window.__HARNESS__.changeMode('markdown'));

  const markdown = await page.evaluate(() => window.__HARNESS__.getMarkdown());

  expect(markdown).toContain('$e^{i\\pi} + 1 = 0$');
  expect(markdown).toContain('$f(x)=ax^2+bx+c$ where $a \\neq 0$ and $a, b, c \\in R$ is ');
  expect(markdown).not.toContain('\\\\pi');
  expect(markdown).not.toContain('\\\\neq');
  expect(markdown).not.toContain('\\\\in');
});
