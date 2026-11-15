// Decode QR codes in an image (local file or URL) with jsQR + sharp. Tries several scales,
// and scans tiles so pages with several QR codes (WeChat + Trip.com) yield all of them.
import fs from 'node:fs';
import sharp from 'sharp';
import jsQR from 'jsqr';

const UA = 'AsiaTripRankerBot/0.1 (personal travel-research tool)';

async function load(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${src}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (!fs.existsSync(src)) throw new Error(`file not found: ${src}`);
  return fs.readFileSync(src);
}

async function scan(img, left, top, width, height, scale) {
  const w = Math.max(64, Math.round(width * scale));
  const { data, info } = await img.clone().extract({ left, top, width, height }).resize({ width: w }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: 'attemptBoth' });
  if (r) { const k = width / info.width; const c = r.location.topLeftCorner, d = r.location.bottomRightCorner; r.center = { x: left + ((c.x + d.x) / 2) * k, y: top + ((c.y + d.y) / 2) * k }; }
  return r;
}

/** Returns a list of decoded strings (unique). See decodeQrReport for the undecoded-region count. */
export async function decodeQr(src) { return (await decodeQrReport(src)).codes; }

/** { codes: [string], centers: [{x,y}] } — decoded QR codes and where they are in the image. */
export async function decodeQrReport(src) {
  const buf = await load(src);
  const img = sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' });
  const { width, height } = await img.metadata();
  const found = new Map(); // text → center
  const regions = [[0, 0, width, height]];
  // tiles: 2×2 and 3×3 grids with overlap, to catch several codes on one page
  for (const n of [2, 3]) {
    const tw = Math.ceil(width / n), th = Math.ceil(height / n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const l = Math.max(0, Math.round(i * tw - tw * 0.25)), t = Math.max(0, Math.round(j * th - th * 0.25));
      regions.push([l, t, Math.min(width - l, Math.round(tw * 1.5)), Math.min(height - t, Math.round(th * 1.5))]);
    }
  }
  for (const [l, t, w, h] of regions) {
    for (const scale of [1, 0.5, 1.5]) {
      if (w * scale > 3000 || w < 40 || h < 40) continue;
      try { const r = await scan(img, l, t, w, h, scale); if (r?.data) { if (!found.has(r.data)) found.set(r.data, r.center); break; } } catch { /* try next */ }
    }
  }
  // No reliable pure-JS detector exists for non-QR codes (WeChat "sun codes"); the CLI always says so.
  return { codes: [...found.keys()], centers: [...found.values()] };
}
