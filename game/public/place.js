// Ask box + embed glue for a place page served by the game.
const root = document.documentElement;
const embed = root.dataset.embed === '1';
const sec = document.querySelector('.g-ask');
const form = sec?.querySelector('form');
const ta = form?.querySelector('textarea');
const out = sec?.querySelector('.g-ask__out');
const fab = document.querySelector('.g-ask__fab');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let busy = false;

function focusAsk() {
  sec?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => ta?.focus({ preventScroll: true }), 350);
}

async function ask(question) {
  if (busy || !question.trim()) return;
  busy = true;
  form.classList.add('is-busy');
  const card = document.createElement('div');
  card.className = 'g-answer is-live';
  card.innerHTML = `<p class="g-answer__q">${esc(question)}</p><p class="g-answer__status"><span class="g-dots"><i></i><i></i><i></i></span><span class="txt">Thinking…</span></p><div class="g-answer__body"></div>`;
  out.prepend(card);
  const status = card.querySelector('.g-answer__status .txt');
  const body = card.querySelector('.g-answer__body');
  let text = '';
  const t0 = Date.now();
  const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); card.querySelector('.g-answer__status').dataset.t = `${s}s`; }, 1000);
  try {
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sec.dataset.id, kind: sec.dataset.kind || 'place', question }) });
    if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `HTTP ${res.status}`); }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', finished = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'status') status.textContent = ev.text;
        else if (ev.type === 'reset') { text = ''; body.textContent = ''; }
        else if (ev.type === 'delta') { text += ev.text; body.textContent = text.replace(/\n?\s*\**TL;?DR[\s\S]*$/i, ''); status.textContent = 'Writing…'; }
        else if (ev.type === 'done') {
          finished = true;
          body.innerHTML = `<div class="rich">${ev.html}</div>${ev.tldr ? `<p class="g-answer__tldr"><b>TL;DR</b> ${esc(ev.tldr)}</p>` : ''}${ev.warning ? `<p class="g-answer__warn">${esc(ev.warning)}</p>` : ''}`;
          card.querySelector('.g-answer__status').remove();
          card.classList.remove('is-live');
          try { parent.postMessage({ atr: 'asked' }, location.origin); } catch {}
        } else if (ev.type === 'error') { finished = true; throw new Error(ev.message); }
      }
    }
    if (!finished) throw new Error('The answer stream ended early.');
  } catch (e) {
    card.classList.remove('is-live');
    card.classList.add('is-error');
    card.querySelector('.g-answer__status')?.remove();
    body.innerHTML = `${text ? `<div class="rich"><p>${esc(text)}</p></div>` : ''}<p class="g-answer__warn">Couldn’t get an answer: ${esc(e.message)}. You can also ask in the main Claude Code thread.</p>`;
  } finally {
    clearInterval(tick);
    busy = false;
    form.classList.remove('is-busy');
  }
}

if (form) {
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = ta.value; ta.value = ''; ask(q); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  sec.querySelectorAll('.g-ask__chips .chip').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
}
fab?.addEventListener('click', (e) => { e.preventDefault(); focusAsk(); });
if (fab && sec && 'IntersectionObserver' in window) new IntersectionObserver(([en]) => fab.classList.toggle('is-hidden', en.isIntersecting), { threshold: 0.15 }).observe(sec);

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  if (e.data?.atr === 'ask') focusAsk();
  if (e.data?.atr === 'theme') { if (e.data.theme) root.setAttribute('data-theme', e.data.theme); else root.removeAttribute('data-theme'); }
});
if (embed) {
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.target.closest('textarea')) parent.postMessage({ atr: 'close' }, location.origin); });
  document.querySelector('.topbar .brand')?.addEventListener('click', (e) => { e.preventDefault(); parent.postMessage({ atr: 'close' }, location.origin); });
}
if (location.hash === '#ask') setTimeout(focusAsk, 300);
