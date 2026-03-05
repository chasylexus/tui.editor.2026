import { findFragmentTarget } from '@/utils/link';

describe('link utils', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('finds fragment target by href id in the same root', () => {
    container.innerHTML = `
      <p><sup class="footnote-ref"><a id="fnref-first-1" href="#fn-first">1</a></sup></p>
      <hr />
      <ol>
        <li><a id="fn-first">[1]</a> Footnote</li>
      </ol>
    `;

    const target = findFragmentTarget(container, '#fn-first');

    expect(target?.id).toBe('fn-first');
  });

  it('resolves encoded and normalized fragments', () => {
    container.innerHTML = `
      <p id="My_ID">x</p>
    `;

    expect(findFragmentTarget(container, '#My%20ID')?.id).toBe('My_ID');
    expect(findFragmentTarget(container, '#My ID')?.id).toBe('My_ID');
  });

  it('resolves heading targets by heading text when id is missing', () => {
    container.innerHTML = `
      <h2>Анализ рекламного digital-рынка в России</h2>
    `;

    const target = findFragmentTarget(container, '#Анализ рекламного digital-рынка в России');

    expect(target?.tagName).toBe('H2');
    expect(target?.textContent).toContain('Анализ рекламного digital-рынка в России');
  });
});
