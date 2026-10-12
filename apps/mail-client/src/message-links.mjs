export function safeLink(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function textParts(text) {
  return String(text || '').split(/((?:https?:\/\/|mailto:)[^\s<>"\[\]]+)/gi).flatMap((part, index) => {
    if (index % 2 === 0) return [{text: part}];
    const value = part.replace(/[.,;!?]+$/, '');
    const href = safeLink(value);
    return [{text: value, href}, {text: part.slice(value.length)}];
  });
}

export function htmlLinks(html, Parser = globalThis.DOMParser) {
  if (!html || !Parser) return [];
  const document = new Parser().parseFromString(html, 'text/html');
  const seen = new Set();
  return Array.from(document.querySelectorAll('a[href]')).flatMap(anchor => {
    const href = safeLink(anchor.getAttribute('href'));
    if (!href || seen.has(href)) return [];
    seen.add(href);
    const image = anchor.querySelector('img');
    return [{href, text: anchor.textContent.trim() || image?.getAttribute('alt') || new URL(href).hostname || href}];
  });
}
