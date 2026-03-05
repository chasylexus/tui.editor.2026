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

type FragmentRoot = Document | Element;

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

function escapeCssSelector(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, '\\$&');
}

function getDocument(root: FragmentRoot) {
  return root instanceof Document ? root : root.ownerDocument || document;
}

function includesNode(root: FragmentRoot, node: Node | null) {
  if (!node) {
    return false;
  }

  if (root instanceof Document) {
    return root.contains(node);
  }

  return root.contains(node);
}

export function findFragmentTarget(root: FragmentRoot, href: string) {
  const normalizedHref = normalizeFragmentHref(href || '');

  if (!normalizedHref || normalizedHref[0] !== '#') {
    return null;
  }

  const raw = normalizedHref.slice(1);
  const decoded = safeDecodeURIComponent(raw);
  const candidates = [raw, decoded, normalizeFragmentId(raw), normalizeFragmentId(decoded)]
    .filter(Boolean)
    .filter((value, idx, arr) => arr.indexOf(value) === idx);
  const doc = getDocument(root);

  for (const id of candidates) {
    const byId = doc.getElementById(id);

    if (includesNode(root, byId)) {
      return byId as HTMLElement;
    }

    try {
      const byQuery = root.querySelector<HTMLElement>(`[id="${escapeCssSelector(id)}"]`);

      if (byQuery) {
        return byQuery;
      }
    } catch (e) {
      // ignore invalid selector characters and continue with next candidate
    }
  }

  const headingElements = root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');

  for (const heading of Array.from(headingElements)) {
    const text = String(heading.textContent || '').trim();

    if (!text) {
      continue;
    }

    const headingCandidates = [text, normalizeFragmentId(text), createAnchorIdFromText(text)];

    if (headingCandidates.some((candidate) => candidates.includes(candidate))) {
      return heading;
    }
  }

  return null;
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
