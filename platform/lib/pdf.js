// `atr pdf <url|file>`: text and page images of a PDF, with pdf.js (pdfjs-dist) and @napi-rs/canvas.
// Both are npm packages with prebuilt binaries: nothing to install on the machine (no poppler).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { cacheDir } from './net.js';
import { renderUrlProblem } from './pageview.js';

const require = createRequire(import.meta.url);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_PAGES = 20;

/** "1-3,5" → [1,2,3,5] within 1..n. Empty spec → all pages. */
export function parsePages(spec, n) {
  if (!spec) return Array.from({ length: n }, (_, i) => i + 1);
  const out = new Set();
  for (const part of String(spec).split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+)?)?$/);
    if (!m) throw new Error(`--pages "${spec}": use page numbers like 1-3,5 or 4-`);
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : part.includes('-') ? n : a;
    for (let p = Math.max(1, a); p <= Math.min(n, b); p++) out.add(p);
  }
  if (!out.size) throw new Error(`--pages "${spec}" is outside the document (it has ${n} page${n === 1 ? '' : 's'})`);
  return [...out].sort((x, y) => x - y);
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pdf';

/** Download a PDF (or read a local file). Returns { buf, file, name }. */
export async function loadPdf(src, { fetch: f = fetch, offline = process.env.ATR_OFFLINE === '1' } = {}) {
  if (!/^https?:\/\//i.test(src)) {
    if (!fs.existsSync(src)) throw new Error(`no such file: ${src}`);
    const buf = fs.readFileSync(src);
    return { buf, file: path.resolve(src), name: slug(path.basename(src, path.extname(src))) };
  }
  const problem = renderUrlProblem(src);
  if (problem) throw new Error(problem);
  if (offline) throw new Error("ATR_OFFLINE=1: can't download PDFs offline");
  const res = await f(src, { headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`could not download the PDF: HTTP ${res.status}${[403, 429].includes(res.status) ? ' (blocked; try opening it in ./atr render, or another copy of the file)' : ''}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_PDF_BYTES) throw new Error(`the PDF is ${Math.round(len / 1048576)} MB, over the ${MAX_PDF_BYTES / 1048576} MB limit`);
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) { size += chunk.length; if (size > MAX_PDF_BYTES) throw new Error(`the PDF is over the ${MAX_PDF_BYTES / 1048576} MB limit`); chunks.push(chunk); }
  const buf = Buffer.concat(chunks);
  const u = new URL(res.url || src);
  const name = `${slug(u.hostname.replace(/^www\./, ''))}-${slug(path.basename(u.pathname, '.pdf'))}-${crypto.createHash('sha1').update(src).digest('hex').slice(0, 6)}`;
  const dir = path.join(cacheDir(), 'pdf');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.pdf`);
  fs.writeFileSync(file, buf);
  return { buf, file, name, finalUrl: res.url || src, contentType: res.headers.get('content-type') || '' };
}

/** Text of one pdf.js page: items joined, line breaks where pdf.js marks them or where the line moves. */
function pageText(tc) {
  let out = '', lastY = null;
  for (const it of tc.items) {
    if (typeof it.str !== 'string') continue;
    const y = it.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
    out += it.str;
    if (it.hasEOL) out += '\n';
    else if (it.str && !/\s$/.test(it.str)) out += ' ';
    if (y !== undefined) lastY = y;
  }
  return out.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Read a PDF. opts: { pages: "1-3,5", images: bool, scale = 1.5, fetch, outDir }
 * Returns { src, file, pageCount, title?, pages: [{ n, text, chars, image? }], textFile, noText: [n] }.
 */
export async function readPdf(src, opts = {}) {
  const { buf, file, name, finalUrl } = await loadPdf(src, opts);
  if (buf.subarray(0, 1024).indexOf('%PDF') < 0) {
    const head = buf.subarray(0, 300).toString('utf8');
    throw new Error(`not a PDF${/<html|<!doctype/i.test(head) ? ' (the server sent a web page: open it with ./atr render)' : ''}`);
  }
  const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf), verbosity: 0, isEvalSupported: false,
    cMapUrl: path.join(root, 'cmaps') + path.sep, cMapPacked: true, // CJK fonts
    standardFontDataUrl: path.join(root, 'standard_fonts') + path.sep,
  });
  const doc = await task.promise;
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const wanted = parsePages(opts.pages, doc.numPages);
    const out = { src, ...(finalUrl && finalUrl !== src ? { finalUrl } : {}), file, pageCount: doc.numPages, title: meta?.info?.Title || undefined, pages: [], noText: [] };
    const imgDir = opts.images ? path.join(opts.outDir || path.join(cacheDir(), 'pdf'), name) : null;
    if (imgDir) fs.mkdirSync(imgDir, { recursive: true });
    let imaged = 0;
    for (const n of wanted) {
      const page = await doc.getPage(n);
      const text = pageText(await page.getTextContent());
      const p = { n, text, chars: text.length };
      if (text.replace(/\s/g, '').length < 5) out.noText.push(n); // scanned pages have no text layer at all
      if (imgDir && imaged < MAX_IMAGE_PAGES) {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(opts.scale ?? 1.5, 2000 / base.width); // at most ~2000 px wide: readable, not huge
        const vp = page.getViewport({ scale });
        const { canvas, context } = doc.canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height));
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport: vp }).promise;
        p.image = path.join(imgDir, `page-${String(n).padStart(3, '0')}.png`);
        fs.writeFileSync(p.image, canvas.toBuffer('image/png'));
        imaged++;
      }
      out.pages.push(p);
      page.cleanup();
    }
    if (imgDir && wanted.length > MAX_IMAGE_PAGES) out.imagesCapped = MAX_IMAGE_PAGES;
    const dir = path.join(cacheDir(), 'pdf');
    fs.mkdirSync(dir, { recursive: true });
    out.textFile = path.join(dir, `${name}.txt`);
    fs.writeFileSync(out.textFile, out.pages.map((p) => `--- page ${p.n} ---\n${p.text}`).join('\n\n') + '\n');
    return out;
  } finally { await Promise.resolve(task.destroy?.()).catch(() => {}); }
}
