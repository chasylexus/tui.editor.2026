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

function toAnchorCandidate(text: string) {
  return normalizeFragmentId(text)
    .replace(/["'`<>]/g, '')
    .replace(/^#+/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function createAnchorIdFromText(text: string) {
  const candidate = toAnchorCandidate(text);

  return candidate || 'anchor';
}

export function collectExistingAnchorIds(markdown: string) {
  const ids = new Set<string>();
  const customAnchorRe = /<a\s+[^>]*id\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
  const headingRe = /^#{1,6}\s+(.+)$/gm;
  let match = customAnchorRe.exec(markdown);

  while (match) {
    const id = match[1] || match[2];

    if (id) {
      ids.add(normalizeFragmentId(id));
    }
    match = customAnchorRe.exec(markdown);
  }

  match = headingRe.exec(markdown);
  while (match) {
    const heading = match[1].trim();

    if (heading) {
      ids.add(createAnchorIdFromText(heading));
    }
    match = headingRe.exec(markdown);
  }

  return ids;
}

export function createUniqueAnchorId(base: string, existingIds: Set<string>) {
  const normalizedBase = createAnchorIdFromText(base);

  if (!existingIds.has(normalizedBase)) {
    return normalizedBase;
  }

  let idx = 1;

  while (existingIds.has(`${normalizedBase}_${idx}`)) {
    idx += 1;
  }

  return `${normalizedBase}_${idx}`;
}

export function collectExistingCustomAnchorIds(markdown: string) {
  const ids = new Set<string>();
  const customAnchorRe = /<a\s+[^>]*id\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
  let match = customAnchorRe.exec(markdown);

  while (match) {
    const id = match[1] || match[2];

    if (id) {
      ids.add(id);
    }
    match = customAnchorRe.exec(markdown);
  }

  return ids;
}

export function createUniqueAnchorIdFromInput(anchorId: string, existingIds: Set<string>) {
  if (!existingIds.has(anchorId)) {
    return anchorId;
  }

  let idx = 1;

  while (existingIds.has(`${anchorId}_${idx}`)) {
    idx += 1;
  }

  return `${anchorId}_${idx}`;
}
