export function normalizeFragmentId(fragment: string) {
  return fragment.trim().replace(/\s+/g, '_');
}

export function normalizeFragmentHref(href: string) {
  if (!href || href[0] !== '#') {
    return href;
  }

  const fragment = href.slice(1);

  return `#${normalizeFragmentId(fragment)}`;
}
