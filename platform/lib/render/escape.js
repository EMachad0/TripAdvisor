// HTML escaping + a tiny, safe Markdown subset. Content never injects raw HTML.

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
export const attr = esc;

/** Only http(s) URLs survive; everything else becomes '#'. */
export function safeUrl(u) {
  const s = String(u ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '#';
}

/** Inline Markdown: **bold**, *italic* / _italic_, `code`, [text](https://url). Input is escaped first. */
export function mdInline(text) {
  let s = esc(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" rel="noopener noreferrer" target="_blank">${label}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  return s;
}

/** Block Markdown: paragraphs (blank line), "- " bullet lists, "1. " numbered lists. */
export function md(text) {
  const chunks = String(text ?? '').replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  return chunks.filter((c) => c.trim()).map((chunk) => {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.every((l) => /^[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${mdInline(l.replace(/^[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${mdInline(l.replace(/^\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    return `<p>${mdInline(lines.join(' '))}</p>`;
  }).join('\n');
}
