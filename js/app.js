/* Rumbo B2 — study app. Data comes from data/*.js, conjugations from conj.js. */
(() => {
  'use strict';

  /* ================= helpers ================= */
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const norm = s => String(s).trim().toLowerCase().replace(/^[¿¡\s]+|[.!?。\s]+$/g, '').replace(/\s+/g, ' ');
  const noAccent = s => s.replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ').normalize('NFC');
  const loose = s => noAccent(String(s).toLowerCase()).replace(/[¿?¡!.,;:"«»()—-]/g, ' ').replace(/\s+/g, ' ').trim();
  function hashStr(s) { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; }

  // 'ok' | 'accent' (only the written accents differ) | 'no'
  function check(given, answers) {
    const g = norm(given);
    if (!g) return 'no';
    if (answers.some(a => norm(a) === g)) return 'ok';
    if (answers.some(a => noAccent(norm(a)) === noAccent(g))) return 'accent';
    return 'no';
  }

  const LEVELS = ['A1', 'A2', 'B1', 'B2'];
  const LEVEL_ZH = { A1: '入门', A2: '初级', B1: '中级', B2: '中高级' };
  const POS = { n: '名词', v: '动词', adj: '形容词', adv: '副词', prep: '前置词', conj: '连词', pron: '代词', det: '限定词', num: '数词', interj: '感叹词', expr: '短语' };

  /* ================= content ================= */
  const CARDS = new Map();
  const DECK = { v: [], x: [], p: [] };
  const CATS = { v: [], x: [], p: [] };
  (function loadContent() {
    const add = c => { CARDS.set(c.id, c); DECK[c.deck].push(c); };
    const V = window.DATA_VOCAB || { themes: [], rows: [] };
    CATS.v = V.themes;
    for (const r of V.rows) add({ id: r[0], deck: 'v', lv: r[1], cat: V.themes[r[2]], es: r[3], pos: r[4], zh: r[5], exEs: r[6], exZh: r[7] });
    const P = window.DATA_PHRASES || {};
    if (P.x) { CATS.x = P.x.cats; for (const r of P.x.rows) add({ id: r[0], deck: 'x', cat: P.x.cats[r[1]], lv: r[2], es: r[3], zh: r[4], note: r[5], exEs: r[6], exZh: r[7] }); }
    if (P.p) { CATS.p = P.p.cats; for (const r of P.p.rows) add({ id: r[0], deck: 'p', cat: P.p.cats[r[1]], lv: r[2], es: r[3], zh: r[4], note: r[5] }); }
  })();
  const G = window.DATA_GRAMMAR || [];
  const Conj = window.Conj;

  // Feminine form of "bonito/a", "trabajador/a", "inglés/a".
  function splitGender(part) {
    const m = part.match(/^(.*?)([\p{L}]+)\/(a|as)$/u);
    if (!m) return [part];
    const w = m[2];
    const stem = w.endsWith('o') ? w.slice(0, -1) : w.replace(/[áéíóú](?=[nsl]$)/, ch => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }[ch]));
    return [m[1] + w, m[1] + stem + 'a'];
  }
  // Every spelling we accept for a headword ("el profesor / la profesora", "bonito/a").
  function variants(es) {
    const out = new Set();
    for (const part of es.split(/\s+\/\s+/)) for (const f of splitGender(part)) {
      out.add(norm(f));
      out.add(norm(f.replace(/^(el|la|los|las)\s+/i, '')));
    }
    return [...out];
  }
  const sayable = es => es.split(/\s+\/\s+/).map(p => splitGender(p).join(', ')).join(', ').replace(/\.\.\./g, ',');

  /* ================= state ================= */
  const LS_KEY = 'rumbo-b2-v1';
  const DAY = 864e5;
  const today = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4 - 4 * 36e5) / DAY); };
  const nowMin = () => Math.floor(Date.now() / 6e4);
  const defaults = () => ({
    v: 1, cards: {}, gram: {}, days: {}, conj: {},
    set: { goal: 20, pgoal: 5, dir: 'es', auto: true, rate: 0.9, voice: '', engine: 'auto', vos: true, tenses: ['pres'], vgroup: 'all', t: 0 },
  });
  let S = defaults();

  function mergeState(a, b) {
    const out = defaults();
    out.cards = Object.assign({}, a.cards);
    for (const id in b.cards || {}) {
      const x = out.cards[id], y = b.cards[id];
      if (!Array.isArray(y)) continue;
      if (!x || (y[5] || 0) > (x[5] || 0) || ((y[5] || 0) === (x[5] || 0) && y[3] > x[3])) out.cards[id] = y;
    }
    for (const src of [a.gram || {}, b.gram || {}]) for (const id in src) {
      const x = out.gram[id] || { best: 0, t: 0 }, y = src[id] || {};
      out.gram[id] = { best: Math.max(x.best || 0, y.best || 0), t: Math.max(x.t || 0, y.t || 0) };
    }
    for (const src of [a.days || {}, b.days || {}]) for (const d in src) {
      const x = out.days[d] || (out.days[d] = { n: 0, r: 0, p: 0, g: 0, c: 0 });
      for (const k of ['n', 'r', 'p', 'g', 'c']) x[k] = Math.max(x[k] || 0, (src[d] && src[d][k]) || 0);
    }
    for (const src of [a.conj || {}, b.conj || {}]) for (const k in src) {
      const x = out.conj[k], y = src[k];
      if (Array.isArray(y) && (!x || y[1] > x[1])) out.conj[k] = y;
    }
    const sa = a.set || {}, sb = b.set || {};
    out.set = Object.assign(out.set, (sb.t || 0) > (sa.t || 0) ? sb : sa);
    if (!Array.isArray(out.set.tenses) || !out.set.tenses.length) out.set.tenses = ['pres'];
    return out;
  }

  function loadLocal() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) S = mergeState(defaults(), JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  }
  function writeLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }
  let localTimer = 0;
  function save() {
    clearTimeout(localTimer);
    localTimer = setTimeout(writeLocal, 250);
    cloudSchedule();
  }
  function saveSettings() { S.set.t = nowMin(); save(); }
  window.addEventListener('pagehide', writeLocal);

  /* ---------- account sync (per-person private documents) ---------- */
  const SHARDS = 8;
  const DOCS = ['meta'].concat(Array.from({ length: SHARDS }, (_, i) => 'c' + i));
  const cloud = { col: null, remote: {}, status: 'local', timer: 0, busy: false, again: false };
  const shardOf = id => 'c' + (hashStr(id) % SHARDS);
  function docBody(name) {
    if (name === 'meta') {
      const cut = today() - 400, days = {};
      for (const d in S.days) if (+d >= cut) days[d] = S.days[d];
      return { gram: S.gram, days, conj: S.conj, set: S.set };
    }
    const cards = {};
    for (const id in S.cards) if (shardOf(id) === name) cards[id] = S.cards[id];
    return { cards };
  }
  const SYNC_TEXT = { local: '仅存本机', connecting: '连接中…', synced: '已同步', saving: '同步中…', readonly: '仅存本机' };
  function setCloud(s) {
    cloud.status = s;
    const el = $('#sync');
    if (el) { el.dataset.s = s; el.lastElementChild.textContent = SYNC_TEXT[s]; }
  }
  async function cloudInit() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    setCloud('connecting');
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const uid = db && user ? await user.id() : null;
      if (!uid) return setCloud('local');
      const col = db.collection('data/users/' + uid);
      const snap = await col.get();
      const remote = defaults();
      remote.set.t = -1;
      let any = false;
      for (const d of snap.docs) {
        const data = d.data();
        if (!data || !DOCS.includes(d.id)) continue;
        any = true;
        cloud.remote[d.id] = JSON.stringify(data);
        if (d.id === 'meta') { remote.gram = data.gram || {}; remote.days = data.days || {}; remote.conj = data.conj || {}; if (data.set) remote.set = data.set; }
        else Object.assign(remote.cards, data.cards || {});
      }
      if (any) { S = mergeState(S, remote); writeLocal(); if (!busyStudying()) render(); }
      cloud.col = col;
      setCloud('synced');
      cloudSchedule(500);
    } catch (e) { setCloud('local'); }
  }
  function cloudSchedule(ms) {
    if (!cloud.col || cloud.status === 'readonly') return;
    clearTimeout(cloud.timer);
    cloud.timer = setTimeout(cloudFlush, ms == null ? 4000 : ms);
  }
  async function cloudFlush() {
    if (!cloud.col) return;
    if (cloud.busy) { cloud.again = true; return; }
    cloud.busy = true;
    try {
      for (const name of DOCS) {
        const body = docBody(name), json = JSON.stringify(body);
        if (json === cloud.remote[name]) continue;
        if (!cloud.remote[name] && (name === 'meta' ? !S.set.t && !Object.keys(S.days).length && !Object.keys(S.gram).length : json === '{"cards":{}}')) continue;
        setCloud('saving');
        await cloud.col.doc(name).set(body);
        cloud.remote[name] = json;
      }
      setCloud('synced');
    } catch (e) {
      if (e && e.code === 'invalid_argument') setCloud('readonly');
      else { setCloud('local'); cloud.again = false; clearTimeout(cloud.timer); cloud.timer = setTimeout(cloudFlush, 30000); }
    }
    cloud.busy = false;
    if (cloud.again) { cloud.again = false; cloudSchedule(1000); }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { writeLocal(); if (cloud.col) cloudSchedule(0); } });

  /* ================= spaced repetition ================= */
  // card record: [due day, interval days, ease %, successful reviews, lapses, last-touched minute]
  function schedule(c, g, now) {
    let [due, ivl, ease, reps, lapses] = c || [now, 0, 250, 0, 0];
    if (ivl === 0) {
      if (g === 1) return [now, 0, ease, reps, lapses];
      ivl = g === 2 ? 1 : g === 3 ? (reps ? 1 : 2) : (reps ? 3 : 5);
      if (g === 4) ease += 15;
      return [now + ivl, ivl, ease, reps + 1, lapses];
    }
    const over = Math.max(0, now - due);
    if (g === 1) return [now, 0, Math.max(130, ease - 20), reps, lapses + 1];
    if (g === 2) { ivl = Math.max(ivl + 1, Math.round(ivl * 1.2)); ease = Math.max(130, ease - 15); }
    else if (g === 3) ivl = Math.max(ivl + 1, Math.round((ivl + over / 2) * ease / 100));
    else { ivl = Math.max(ivl + 2, Math.round((ivl + over) * ease / 100 * 1.3)); ease += 15; }
    ivl = Math.min(ivl, 365);
    return [now + ivl, ivl, ease, reps + 1, lapses];
  }
  const fmtIvl = d => d <= 0 ? '马上再看' : d < 30 ? d + ' 天后' : d < 365 ? Math.round(d / 30) + ' 个月后' : '1 年后';
  function dayRec() { const d = today(); return S.days[d] || (S.days[d] = { n: 0, r: 0, p: 0, g: 0, c: 0 }); }
  const dayView = () => S.days[today()] || { n: 0, r: 0, p: 0, g: 0, c: 0 };
  function grade(id, g) {
    const old = S.cards[id], wasNew = !old || !old[3];
    const n = schedule(old, g, today());
    n[5] = nowMin();
    S.cards[id] = n;
    const rec = dayRec();
    if (wasNew) { if (n[3] > 0) rec[CARDS.get(id).deck === 'v' ? 'n' : 'p']++; }
    else rec.r++;
    save();
  }
  // 0 not learned, 1 learning, 2 mastered (interval of three weeks or more)
  const status = id => { const c = S.cards[id]; return !c || !c[3] ? 0 : c[1] >= 21 ? 2 : 1; };
  const isDue = (id, now) => { const c = S.cards[id]; return !!c && c[0] <= now; };
  function dueIds(decks, cat) {
    const now = today(), out = [];
    for (const d of decks) for (const c of DECK[d]) if ((!cat || c.cat === cat) && isDue(c.id, now)) out.push(c.id);
    return out.sort((a, b) => S.cards[a][0] - S.cards[b][0]);
  }
  function newIds(decks, n, f) {
    const out = [];
    for (const d of decks) for (const c of DECK[d]) {
      if (out.length >= n) return out;
      if (S.cards[c.id]) continue;
      if (f && ((f.lv && c.lv !== f.lv) || (f.cat && c.cat !== f.cat))) continue;
      out.push(c.id);
    }
    return out;
  }
  function count(decks, f) {
    let total = 0, learned = 0, mastered = 0;
    for (const d of decks) for (const c of DECK[d]) {
      if (f && ((f.lv && c.lv !== f.lv) || (f.cat && c.cat !== f.cat))) continue;
      total++;
      const s = status(c.id);
      if (s) learned++;
      if (s === 2) mastered++;
    }
    return { total, learned, mastered };
  }
  function streak() {
    const act = d => { const r = S.days[d]; return !!r && (r.n + r.r + r.p + r.g + r.c) > 0; };
    let d = today(), n = 0;
    if (!act(d)) d--;
    while (act(d)) { n++; d--; }
    return n;
  }
  const gramDone = id => ((S.gram[id] || {}).best || 0) >= 8;
  const nextLesson = () => G.find(l => !gramDone(l.id)) || null;

  /* ================= speech ================= */
  const speech = { voices: [], cap: null };
  function refreshVoices() {
    try { speech.voices = window.speechSynthesis ? speechSynthesis.getVoices().filter(v => /^es([-_]|$)/i.test(v.lang)) : []; }
    catch (e) { speech.voices = []; }
    document.body.classList.toggle('no-tts', !canSpeak());
  }
  const canSpeak = () => speech.voices.length > 0 || !!speech.cap;
  function pickVoice() {
    const vs = speech.voices;
    return vs.find(v => v.name === S.set.voice) || vs.find(v => /es[-_]ES/i.test(v.lang) && v.localService) || vs.find(v => /es[-_]ES/i.test(v.lang)) || vs[0] || null;
  }
  function speak(text) {
    text = sayable(String(text || ''));
    if (!text) return;
    const browser = speech.voices.length && !(S.set.engine === 'claude' && speech.cap);
    if (browser) {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text), v = pickVoice();
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-ES';
        u.rate = S.set.rate;
        speechSynthesis.speak(u);
        return;
      } catch (e) { /* fall through to the Claude voice */ }
    }
    if (speech.cap) speech.cap.speak(text, { language: 'es-ES', rate: clamp(S.set.rate, 0.7, 1.5) }).catch(() => {});
  }
  const SPK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const spk = text => h('button', { class: 'spk', type: 'button', 'aria-label': '朗读', title: '朗读', html: SPK_SVG, onclick: e => { e.stopPropagation(); speak(text); } });
  function speechInit() {
    refreshVoices();
    try { if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', refreshVoices); } catch (e) { /* no voices here */ }
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('tts').then(t => { speech.cap = t; refreshVoices(); }).catch(() => {});
    }
  }

  /* ================= shared UI pieces ================= */
  const ui = {
    vocabTab: 'study', newLv: '', newCat: '', session: null,
    browse: { q: '', lv: '', cat: '', st: '', n: 60 },
    quiz: null, quizType: 'es2zh', quizScope: 'learned',
    lesson: null, ex: null,
    verbTab: 'drill', drill: null, lookup: 'tener',
    frTab: 'x', frCat: { x: '', p: '' },
    keys: null, confirmReset: false, backup: '',
  };
  const busyStudying = () => !!(ui.session || ui.quiz || ui.lesson || (ui.drill && ui.drill.answered === false && ui.drill.typed));

  function seg(options, value, onpick, cls) {
    return h('div', { class: cls || 'seg', role: 'group' }, options.map(([v, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onpick(v) }, label)));
  }
  function subtabs(options, value, onpick) { return seg(options, value, onpick, 'subtabs'); }
  function select(options, value, onchange, label, id) {
    const el = h('select', { class: 'field', 'aria-label': label, id }, options.map(([v, text]) => h('option', { value: v }, text)));
    el.value = value;
    el.addEventListener('change', () => onchange(el.value));
    return el;
  }
  function accentBar(input) {
    return h('div', { class: 'accents', 'aria-label': '插入西语字符' }, ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¿', '¡'].map(ch =>
      h('button', {
        type: 'button', tabindex: '-1', onmousedown: e => e.preventDefault(), onclick: () => {
          const a = input.selectionStart == null ? input.value.length : input.selectionStart, b = input.selectionEnd == null ? a : input.selectionEnd;
          input.value = input.value.slice(0, a) + ch + input.value.slice(b);
          input.focus();
          input.setSelectionRange(a + 1, a + 1);
        },
      }, ch)));
  }
  const meter = (frac, color) => h('div', { class: 'meter' }, h('i', { style: `width:${Math.round(clamp(frac, 0, 1) * 100)}%` + (color ? `;background:${color}` : '') }));
  const lvChip = lv => h('span', { class: 'chip lv lv-' + lv }, lv);
  const go = name => { if (location.hash === '#' + name) route(); else location.hash = name; };

  /* ================= flashcard session ================= */
  function startSession(ids, owner, title) {
    if (!ids.length) return;
    ui.session = { queue: ids.slice(), total: ids.length, done: 0, revealed: false, spoken: null, owner, title, fresh: 0, reviewed: 0, again: 0 };
    render();
  }
  function sessionEl() {
    const s = ui.session;
    if (!s.queue.length) return sessionDone();
    const id = s.queue[0], card = CARDS.get(id), rec = S.cards[id], isNew = !rec || !rec[3];
    const dir = card.deck === 'p' ? 'zh' : card.deck === 'x' ? 'es' : S.set.dir;
    const frontEs = dir === 'es';
    const reveal = () => { s.revealed = true; render(); if (!frontEs && S.set.auto) speak(card.es); };
    const doGrade = g => {
      grade(id, g);
      s.queue.shift();
      if (g === 1) { s.queue.splice(Math.min(3, s.queue.length), 0, id); s.again++; }
      else { s.done++; if (isNew) s.fresh++; else s.reviewed++; }
      s.revealed = false;
      render();
    };
    ui.keys = e => {
      if (e.target.closest('input, textarea, select')) return;
      if (!s.revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
      else if (s.revealed && '1234'.includes(e.key)) { e.preventDefault(); doGrade(+e.key); }
      else if (e.key === 'r' || e.key === 'R') speak(card.es);
    };
    if (frontEs && S.set.auto && s.spoken !== id) { s.spoken = id; speak(card.es); }
    if (!frontEs) s.spoken = null;

    const tag = card.deck === 'v' ? (POS[card.pos] || '') + ' · ' + card.cat : card.cat;
    const front = h('div', { class: 'fc-front' },
      frontEs
        ? [h('div', { class: 'fc-word', lang: 'es' }, card.es), spk(card.es)]
        : [h('div', { class: 'fc-word zh' }, card.zh), h('p', { class: 'muted' }, '用西语怎么说？先自己说出来')]);
    let back = null;
    if (s.revealed) {
      back = h('div', { class: 'fc-back' },
        frontEs ? h('div', { class: 'fc-ans' }, card.zh)
          : h('div', { class: 'row-wrap', style: 'justify-content:center' }, h('div', { class: 'fc-ans es', lang: 'es' }, card.es), spk(card.es)),
        card.note ? h('div', { class: 'fc-note' }, card.note) : null,
        card.exEs ? h('div', { class: 'fc-ex' },
          h('div', { class: 'row-wrap' }, h('span', { class: 'es', lang: 'es' }, card.exEs), spk(card.exEs)),
          h('div', { class: 'muted' }, card.exZh)) : null);
    }
    const labels = ['忘了', '有点难', '记得', '很熟'];
    const actions = s.revealed
      ? h('div', { class: 'grades' }, [1, 2, 3, 4].map(g =>
        h('button', { type: 'button', class: 'g' + g, onclick: () => doGrade(g) }, labels[g - 1], h('small', null, fmtIvl(schedule(rec, g, today())[1])))))
      : h('button', { type: 'button', class: 'btn btn-primary', onclick: reveal }, '显示答案');
    return h('div', { class: 'study' },
      h('div', { class: 'row-wrap', style: 'justify-content:space-between' },
        h('b', null, s.title),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { ui.session = null; render(); } }, '结束本轮')),
      meter(s.done / s.total),
      h('div', { class: 'fc' },
        h('div', { class: 'fc-meta' }, lvChip(card.lv), h('span', { class: 'chip' }, tag), isNew ? h('span', { class: 'chip fc-new' }, '新') : null,
          h('span', { class: 'count' }, `${s.done} / ${s.total}`)),
        front, back),
      actions,
      h('p', { class: 'hint keys' }, s.revealed ? '键盘：1 忘了 · 2 有点难 · 3 记得 · 4 很熟 · R 再听一遍' : '键盘：空格显示答案 · R 再听一遍'));
  }
  function sessionDone() {
    const s = ui.session;
    ui.keys = null;
    const more = s.owner === 'vocab' ? newIds(['v'], 10, { lv: ui.newLv, cat: ui.newCat }) : [];
    return h('div', { class: 'study' },
      h('div', { class: 'panel stack-s', style: 'text-align:center' },
        h('p', { class: 'eyebrow' }, '¡Muy bien!'),
        h('h2', null, '这一轮完成了'),
        h('p', { class: 'muted' }, `新学 ${s.fresh} 个，复习 ${s.reviewed} 个，其中 ${s.again} 次没想起来。`),
        h('div', { class: 'row-wrap', style: 'justify-content:center' },
          more.length ? h('button', { type: 'button', class: 'btn', onclick: () => startSession(more, 'vocab', '再学 10 个新词') }, '再学 10 个新词') : null,
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ui.session = null; go('hoy'); } }, '回到今日'))));
  }

  /* ================= home ================= */
  function viewHome() {
    const hr = new Date().getHours();
    const hola = hr < 6 || hr >= 21 ? 'Buenas noches' : hr < 14 ? 'Buenos días' : 'Buenas tardes';
    const rec = dayView();
    const first = Math.min(today(), ...Object.keys(S.days).map(Number).filter(d => { const r = S.days[d]; return r.n + r.r + r.p + r.g + r.c > 0; }));
    const dayNo = today() - first + 1, st = streak();

    // route A1 → B2
    const lvInfo = LEVELS.map(lv => {
      const w = count(['v'], { lv }), gl = G.filter(l => l.level === lv), gd = gl.filter(l => gramDone(l.id)).length;
      const frac = (w.total ? w.learned / w.total : 0) * 0.7 + (gl.length ? gd / gl.length : 0) * 0.3;
      return { lv, w, gl: gl.length, gd, frac };
    });
    const here = lvInfo.find(x => x.frac < 0.9) || lvInfo[3];
    const route = h('ol', { class: 'route' }, lvInfo.map(x =>
      h('li', { class: 'stop' + (x.frac >= 0.9 ? ' done' : '') + (x === here ? ' here' : ''), style: `--c: var(--${x.lv.toLowerCase()})` },
        h('div', { class: 'stop-name' }, x.lv, h('small', null, LEVEL_ZH[x.lv])),
        meter(x.frac),
        h('div', { class: 'stop-cap' }, `词 ${x.w.learned}/${x.w.total} · 语法 ${x.gd}/${x.gl}`))));

    // today's tasks
    const dueV = dueIds(['v']).length, dueP = dueIds(['x', 'p']).length;
    const leftN = Math.max(0, S.set.goal - rec.n), leftP = Math.max(0, S.set.pgoal - rec.p);
    const lesson = nextLesson();
    const task = (n, title, sub, label, fn, done) => h('div', { class: 'task' + (done ? ' done' : '') },
      h('div', { class: 'task-n' }, done ? '✓' : n),
      h('div', { class: 'task-body' }, h('b', null, title), h('span', null, sub)),
      h('button', { type: 'button', class: 'btn' + (done ? '' : ' btn-primary'), onclick: fn }, label));
    const tasks = h('div', { class: 'panel tasks' },
      task(dueV, '复习到期的词', dueV ? '按记忆曲线今天该复习的词，先做这个' : '今天没有到期的词', '开始复习',
        () => { ui.vocabTab = 'study'; const ids = dueIds(['v']).slice(0, 80); if (ids.length) { ui.session = null; startSession(ids, 'vocab', '复习'); } go('vocab'); }, !dueV),
      task(leftN, '学新词', `今天已学 ${rec.n} / ${S.set.goal} 个`, leftN ? '学新词' : '再学一些',
        () => { ui.vocabTab = 'study'; ui.session = null; startSession(newIds(['v'], leftN || 10, { lv: ui.newLv, cat: ui.newCat }), 'vocab', '学新词'); go('vocab'); }, !leftN),
      task(lesson ? lesson.level : '✓', '语法', lesson ? '下一课：' + lesson.title : '全部语法课都通过了', lesson ? '去上课' : '回顾',
        () => { ui.lesson = lesson ? lesson.id : null; ui.ex = null; go('gramatica'); }, !lesson),
      task(leftP + dueP, '小词·短句', `今天新学 ${rec.p} / ${S.set.pgoal} 条` + (dueP ? `，${dueP} 条到期` : ''), '练短句',
        () => { const ids = dueIds(['x', 'p']).slice(0, 40).concat(newIds(['p', 'x'], leftP || 5)); ui.session = null; startSession(ids, 'frases', '小词·短句'); go('frases'); }, !(leftP + dueP)),
      task(rec.c, '动词变位', rec.c >= 10 ? '今天已练 ' + rec.c + ' 题' : '每天 10 题，把变位练成条件反射', '练变位',
        () => { ui.verbTab = 'drill'; go('verbos'); }, rec.c >= 10));

    const all = count(['v']), ph = count(['x', 'p']);
    const gdone = G.filter(l => gramDone(l.id)).length;
    const remain = all.total - all.learned;
    const fact = (n, label) => h('div', { class: 'fact' }, h('b', null, n), h('span', null, label));
    const WD = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const week = Array.from({ length: 7 }, (_, i) => { const d = today() - 6 + i, r = S.days[d] || {}; return { d, n: (r.n || 0) + (r.r || 0) + (r.p || 0) + (r.g || 0) + (r.c || 0) }; });
    const max = Math.max(1, ...week.map(x => x.n));
    const weekEl = h('div', { class: 'week', role: 'img', 'aria-label': '最近七天的练习量' }, week.map(x =>
      h('div', { class: x.d === today() ? 'today' : '', title: x.n + ' 次练习' },
        h('i', { style: `height:${Math.round(x.n / max * 100)}%` }),
        h('span', null, WD[new Date((x.d * DAY) + 4 * 36e5 + new Date().getTimezoneOffset() * 6e4 + 12 * 36e5).getDay()]))));

    return h('div', { class: 'stack' },
      h('section', { class: 'hero stack-s' },
        h('p', { class: 'eyebrow' }, `第 ${dayNo} 天 · 连续学习 ${st} 天`),
        h('h1', null, h('span', { class: 'es', lang: 'es' }, `¡${hola}!`), ' 今天继续往 B2 走'),
        route),
      h('section', { class: 'stack-s' }, h('h2', null, '今天的任务'), tasks),
      h('section', { class: 'stack-s' },
        h('h2', null, '目前的进度'),
        h('div', { class: 'panel stack-s' },
          h('div', { class: 'facts' },
            fact(all.learned, `已学词汇 / ${all.total}`), fact(all.mastered, '已牢固掌握'),
            fact(`${gdone}/${G.length}`, '语法课通过'), fact(`${ph.learned}/${ph.total}`, '小词和短句')),
          h('p', { class: 'muted' }, remain > 0
            ? `按每天 ${S.set.goal} 个新词，还需约 ${Math.ceil(remain / S.set.goal)} 天学完全部词汇。`
            : '全部词汇都学过了，接下来靠复习把它们变成长期记忆。'))),
      h('section', { class: 'stack-s' }, h('h2', null, '最近七天'), h('div', { class: 'panel' }, weekEl)),
      h('details', { class: 'panel guide' },
        h('summary', null, '怎么用这个网站学到 B2'),
        h('ul', null,
          h('li', null, '每天先复习、再学新词。复习比学新词重要：到期的词不复习，前面就白学了。'),
          h('li', null, '词卡要诚实打分。想不起来就点「忘了」，它会很快再出现；「很熟」的词会隔很久才回来。'),
          h('li', null, '语法每两三天学一课，练习做到 8 分以上算通过。A1–A2 打基础，B1 的重点是虚拟式，B2 是条件句和各类从句。'),
          h('li', null, '动词变位每天练 10 题，从现在时开始，学到哪个时态就把它加进练习范围。'),
          h('li', null, '小词和短句要开口跟读。pues、bueno、o sea、es que 这些小词决定你听起来像不像在说西语。'),
          h('li', null, '网站负责词汇、语法和句型。听力和口语还要另外练：从 A2 起每天听一点西语播客或看剧，尽早找人对话。'))));
  }

  /* ================= vocabulary ================= */
  function viewVocab() {
    if (ui.session && ui.session.owner === 'vocab') return sessionEl();
    const tabs = subtabs([['study', '学习'], ['browse', '词库'], ['quiz', '测验']], ui.vocabTab, v => { ui.vocabTab = v; ui.quiz = null; render(); });
    const body = ui.vocabTab === 'study' ? vocabStudy() : ui.vocabTab === 'browse' ? vocabBrowse() : vocabQuiz();
    return h('div', { class: 'stack' }, h('div', { class: 'stack-s' }, h('h1', null, '词汇'), tabs), body);
  }
  function vocabStudy() {
    if (!DECK.v.length) return h('p', { class: 'empty' }, '词库还没有加载。');
    const rec = dayView(), due = dueIds(['v']), left = Math.max(0, S.set.goal - rec.n);
    const f = { lv: ui.newLv, cat: ui.newCat }, pool = count(['v'], f);
    const themeOpts = [['', '全部主题']].concat(CATS.v.filter(t => !ui.newLv || DECK.v.some(c => c.cat === t && c.lv === ui.newLv)).map(t => [t, t]));
    const all = count(['v']);
    return h('div', { class: 'stack' },
      h('div', { class: 'panel stack-s' },
        h('div', { class: 'facts' },
          h('div', { class: 'fact' }, h('b', null, due.length), h('span', null, '到期要复习')),
          h('div', { class: 'fact' }, h('b', null, `${rec.n}/${S.set.goal}`), h('span', null, '今日新词')),
          h('div', { class: 'fact' }, h('b', null, all.learned), h('span', null, `已学 / ${all.total}`)),
          h('div', { class: 'fact' }, h('b', null, all.mastered), h('span', null, '已牢固掌握'))),
        h('div', { class: 'row-wrap' },
          h('button', { type: 'button', class: 'btn btn-primary', disabled: !(due.length || left), onclick: () => startSession(due.slice(0, 80).concat(newIds(['v'], left, f)), 'vocab', '今日学习') },
            due.length || left ? `开始今日学习（复习 ${Math.min(due.length, 80)} + 新词 ${Math.min(left, pool.total - pool.learned)}）` : '今天的任务完成了'),
          h('button', { type: 'button', class: 'btn', disabled: !due.length, onclick: () => startSession(due.slice(0, 80), 'vocab', '复习') }, '只复习'),
          h('button', { type: 'button', class: 'btn', onclick: () => startSession(newIds(['v'], 10, f), 'vocab', '学新词') }, '再学 10 个新词'))),
      h('div', { class: 'stack-s' },
        h('h2', null, '新词从哪里学起'),
        h('p', { class: 'muted' }, '默认从 A1 按顺序往上学。想先攻某个级别或主题，在这里选。'),
        h('div', { class: 'filters' },
          select([['', '按顺序（A1 → B2）']].concat(LEVELS.map(l => [l, l + ' ' + LEVEL_ZH[l]])), ui.newLv, v => { ui.newLv = v; ui.newCat = ''; render(); }, '新词级别', 'new-lv'),
          select(themeOpts, ui.newCat, v => { ui.newCat = v; render(); }, '新词主题', 'new-cat')),
        h('p', { class: 'muted' }, `这个范围共 ${pool.total} 个词，已学 ${pool.learned} 个。`)),
      h('div', { class: 'stack-s' },
        h('h2', null, '各级别进度'),
        h('div', { class: 'panel stack-s' }, LEVELS.map(lv => {
          const c = count(['v'], { lv });
          return h('div', { class: 'stack-s', style: 'gap:4px' },
            h('div', { class: 'row-wrap', style: 'justify-content:space-between' }, h('span', null, lvChip(lv), ' ', LEVEL_ZH[lv]), h('span', { class: 'muted num' }, `${c.learned} / ${c.total}`)),
            meter(c.total ? c.learned / c.total : 0, `var(--${lv.toLowerCase()})`));
        }))));
  }
  function wordRow(c) {
    const li = h('li', { class: 'word' },
      h('i', { class: 'st s' + status(c.id) }),
      h('span', { class: 'w-es', lang: 'es' }, c.es, ' ', spk(c.es)),
      h('span', { class: 'w-zh' }, c.zh),
      h('span', { class: 'w-tags' }, h('span', { class: 'chip' }, POS[c.pos] || c.pos), lvChip(c.lv)),
      h('span', { class: 'w-ex' }, h('span', { class: 'es', lang: 'es' }, c.exEs), ' ', spk(c.exEs), h('br'), c.exZh));
    return li;
  }
  function vocabBrowse() {
    const b = ui.browse;
    const list = h('ul', { class: 'words' }), info = h('p', { class: 'muted' }), more = h('div', { style: 'text-align:center' });
    const fill = () => {
      const fold = t => loose(t).replace(/ñ/g, 'n');
      const q = fold(b.q);
      const hits = DECK.v.filter(c => (!b.lv || c.lv === b.lv) && (!b.cat || c.cat === b.cat) && (b.st === '' || status(c.id) === +b.st) &&
        (!q || fold(c.es).includes(q) || c.zh.includes(b.q.trim())));
      info.textContent = `共 ${hits.length} 个词`;
      list.replaceChildren(...hits.slice(0, b.n).map(wordRow));
      more.replaceChildren(hits.length > b.n ? h('button', { type: 'button', class: 'btn', onclick: () => { b.n += 60; fill(); } }, '显示更多') : '');
      if (!hits.length) list.append(h('li', { class: 'empty' }, '没有符合条件的词。'));
    };
    const search = h('input', { class: 'field', id: 'browse-q', type: 'search', placeholder: '搜西语或中文', value: b.q, 'aria-label': '搜索词汇', oninput: e => { b.q = e.target.value; b.n = 60; fill(); } });
    fill();
    return h('div', { class: 'stack-s' },
      h('div', { class: 'filters' }, search,
        select([['', '全部级别']].concat(LEVELS.map(l => [l, l])), b.lv, v => { b.lv = v; b.n = 60; fill(); }, '级别', 'browse-lv'),
        select([['', '全部主题']].concat(CATS.v.map(t => [t, t])), b.cat, v => { b.cat = v; b.n = 60; fill(); }, '主题', 'browse-cat'),
        select([['', '全部状态'], ['0', '还没学'], ['1', '学习中'], ['2', '已掌握']], b.st, v => { b.st = v; b.n = 60; fill(); }, '状态', 'browse-st')),
      h('div', { class: 'legend' }, info, h('span', null, h('i'), '还没学'), h('span', null, h('i', { class: 's1' }), '学习中'), h('span', null, h('i', { class: 's2' }), '已掌握')),
      list, more);
  }

  /* ---------- quiz ---------- */
  function quizPool() {
    const sc = ui.quizScope;
    let pool = sc === 'learned' ? DECK.v.filter(c => status(c.id) > 0) : sc === 'all' ? DECK.v : DECK.v.filter(c => c.lv === sc);
    if (pool.length < 8) pool = DECK.v.filter(c => c.lv === 'A1');
    return pool;
  }
  function startQuiz() {
    const pool = quizPool();
    if (pool.length < 4) return;
    const items = shuffle(pool.slice()).slice(0, 10).map(c => {
      const q = { card: c, type: ui.quizType, given: null, res: null };
      if (q.type === 'es2zh' || q.type === 'zh2es') {
        const same = pool.filter(o => o.id !== c.id && o.pos === c.pos && o.zh !== c.zh);
        const src = same.length >= 3 ? same : DECK.v.filter(o => o.id !== c.id && o.zh !== c.zh);
        q.options = shuffle([c].concat(shuffle(src.slice()).slice(0, 3)));
      }
      return q;
    });
    ui.quiz = { items, i: 0, right: 0 };
    render();
  }
  function vocabQuiz() {
    const z = ui.quiz;
    if (!z) {
      const types = [['es2zh', '看西语选中文'], ['zh2es', '看中文选西语'], ['spell', '看中文拼写']];
      if (canSpeak()) types.push(['dict', '听写例句']);
      const learned = count(['v']).learned;
      return h('div', { class: 'stack' },
        h('div', { class: 'stack-s' }, h('h2', null, '题型'), seg(types, ui.quizType, v => { ui.quizType = v; render(); }, 'pick')),
        h('div', { class: 'stack-s' }, h('h2', null, '范围'),
          seg([['learned', `学过的词（${learned}）`]].concat(LEVELS.map(l => [l, l]), [['all', '全部']]), ui.quizScope, v => { ui.quizScope = v; render(); }, 'pick'),
          ui.quizScope === 'learned' && learned < 8 ? h('p', { class: 'muted' }, '学过的词还不到 8 个，会先从 A1 词汇里出题。') : null),
        h('div', null, h('button', { type: 'button', class: 'btn btn-primary', onclick: startQuiz }, '开始 10 题')));
    }
    if (z.i >= z.items.length) {
      ui.keys = null;
      const wrong = z.items.filter(q => q.res !== 'ok');
      return h('div', { class: 'stack' },
        h('div', { class: 'panel stack-s' },
          h('p', { class: 'eyebrow' }, 'Resultado'),
          h('h2', null, `答对 ${z.right} / ${z.items.length}`),
          h('p', { class: 'muted' }, wrong.length ? '答错的词已排进今天的复习。' : '全对，¡perfecto!'),
          h('div', { class: 'row-wrap' },
            h('button', { type: 'button', class: 'btn btn-primary', onclick: startQuiz }, '再来 10 题'),
            h('button', { type: 'button', class: 'btn', onclick: () => { ui.quiz = null; render(); } }, '换题型'))),
        wrong.length ? h('div', { class: 'stack-s' }, h('h2', null, '答错的词'), h('ul', { class: 'words' }, wrong.map(q => wordRow(q.card)))) : null);
    }
    const q = z.items[z.i], c = q.card, answered = q.res != null;
    const finish = (res, given) => {
      q.res = res; q.given = given;
      if (res === 'ok') z.right++;
      else if (S.cards[c.id] && S.cards[c.id][3]) { S.cards[c.id][0] = today(); S.cards[c.id][5] = nowMin(); save(); }
      render();
      if (q.type !== 'dict') speak(c.es);
    };
    const next = () => { z.i++; render(); };
    let prompt, body;
    if (q.type === 'es2zh' || q.type === 'zh2es') {
      const toZh = q.type === 'es2zh';
      prompt = toZh ? h('div', { class: 'row-wrap', style: 'justify-content:center' }, h('div', { class: 'fc-word', lang: 'es' }, c.es), spk(c.es)) : h('div', { class: 'fc-word zh' }, c.zh);
      body = h('div', { class: 'opts' }, q.options.map((o, i) => h('button', {
        type: 'button', class: 'opt' + (toZh ? ' zh' : '') + (answered ? (o.id === c.id ? ' right' : o.id === q.given ? ' wrong' : '') : ''),
        disabled: answered, lang: toZh ? null : 'es', onclick: () => finish(o.id === c.id ? 'ok' : 'no', o.id),
      }, `${i + 1}. `, toZh ? o.zh : o.es)));
      ui.keys = e => {
        if (!answered && '1234'.includes(e.key) && q.options[+e.key - 1]) { const o = q.options[+e.key - 1]; finish(o.id === c.id ? 'ok' : 'no', o.id); }
        else if (answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); }
      };
    } else {
      const dict = q.type === 'dict';
      const target = dict ? c.exEs : c.es;
      const input = h('input', { class: 'field', id: 'quiz-in', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'es', placeholder: dict ? '写下你听到的句子' : '写出西语', disabled: answered, value: q.given || '' });
      const submit = () => {
        if (answered) return next();
        if (!input.value.trim()) return;
        const res = dict ? (loose(input.value) === loose(target) ? 'ok' : 'no') : check(input.value, variants(c.es));
        finish(res === 'ok' ? 'ok' : res, input.value);
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); } });
      prompt = dict
        ? h('div', { class: 'stack-s', style: 'align-items:center' }, h('button', { type: 'button', class: 'btn', onclick: () => speak(target) }, '▶ 播放句子'), answered ? h('p', { class: 'muted' }, c.exZh) : h('p', { class: 'muted' }, '可以反复听'))
        : h('div', { class: 'stack-s', style: 'align-items:center' }, h('div', { class: 'fc-word zh' }, c.zh), h('span', { class: 'chip' }, POS[c.pos] || ''));
      body = h('div', { class: 'stack-s' }, h('div', { class: 'fill-row' }, input, h('button', { type: 'button', class: 'btn btn-primary', onclick: submit }, answered ? '下一题' : '检查')), answered ? null : accentBar(input));
      ui.keys = e => { if (answered && e.key === 'Enter' && e.target !== input) { e.preventDefault(); next(); } };
      setTimeout(() => { if (!answered) input.focus(); if (dict && !answered && !q.played) { q.played = true; speak(target); } }, 30);
    }
    let fb = null;
    if (answered) {
      const ok = q.res === 'ok';
      fb = h('div', { class: ok ? 'note-ok' : 'note-no' },
        h('b', null, ok ? '对了' : q.res === 'accent' ? '差一点：重音符号不对' : '不对'),
        h('div', null, h('span', { class: 'es', lang: 'es' }, q.type === 'dict' ? c.exEs : c.es), ' — ', q.type === 'dict' ? c.exZh : c.zh),
        q.type !== 'dict' && c.exEs ? h('div', { class: 'muted' }, h('span', { class: 'es', lang: 'es' }, c.exEs), ' ', c.exZh) : null);
    }
    return h('div', { class: 'study' },
      h('div', { class: 'row-wrap', style: 'justify-content:space-between' }, h('b', null, `第 ${z.i + 1} / ${z.items.length} 题`),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { ui.quiz = null; render(); } }, '退出测验')),
      meter(z.i / z.items.length),
      h('div', { class: 'fc', style: 'min-height:0' }, h('div', { class: 'fc-front' }, prompt), body, fb),
      answered && (q.type === 'es2zh' || q.type === 'zh2es') ? h('button', { type: 'button', class: 'btn btn-primary', onclick: next }, '下一题') : null);
  }

  /* ================= grammar ================= */
  function viewGrammar() {
    const lesson = ui.lesson && G.find(l => l.id === ui.lesson);
    if (lesson) return lessonEl(lesson);
    if (!G.length) return h('div', { class: 'stack' }, h('h1', null, '语法'), h('p', { class: 'empty' }, '语法课还没有加载。'));
    return h('div', { class: 'stack' },
      h('div', { class: 'stack-s' }, h('h1', null, '语法'),
        h('p', { class: 'muted' }, `${G.length} 节课，从发音一路到 B2 的条件句和从句。按顺序学，每课练习 8 分以上算通过。`)),
      LEVELS.map(lv => {
        const ls = G.filter(l => l.level === lv);
        if (!ls.length) return null;
        const done = ls.filter(l => gramDone(l.id)).length;
        return h('section', { class: 'stack-s' },
          h('div', { class: 'row-wrap', style: 'justify-content:space-between' },
            h('h2', null, lvChip(lv), ' ', LEVEL_ZH[lv]), h('span', { class: 'muted num' }, `通过 ${done} / ${ls.length}`)),
          h('ol', { class: 'lessons' }, ls.map((l, i) => {
            const g = S.gram[l.id];
            return h('li', null, h('button', { type: 'button', class: 'lesson', onclick: () => { ui.lesson = l.id; ui.ex = null; render(); window.scrollTo(0, 0); } },
              h('span', { class: 'l-no' }, String(i + 1).padStart(2, '0')),
              h('span', { class: 'l-body' }, h('span', { class: 'l-title' }, l.title), h('span', { class: 'l-intro' }, l.intro)),
              g && g.best ? h('span', { class: 'chip', style: gramDone(l.id) ? 'background:var(--good-soft);color:var(--good)' : '' }, gramDone(l.id) ? `通过 ${g.best}/${l.exercises.length}` : `最高 ${g.best}/${l.exercises.length}`)
                : g ? h('span', { class: 'chip' }, '读过') : null));
          })));
      }));
  }
  function blanked(q, fillText, cls) {
    const parts = q.split('___');
    return h('div', { class: 'ex-q', lang: 'es' }, parts[0], h('span', { class: 'blank ' + (cls || '') }, fillText || ' '), parts.slice(1).join('___'));
  }
  function lessonEl(l) {
    if (!S.gram[l.id]) { S.gram[l.id] = { best: 0, t: nowMin() }; save(); }
    if (!ui.ex || ui.ex.id !== l.id) ui.ex = { id: l.id, ans: {} };
    const ex = ui.ex, idx = G.indexOf(l), nextL = G[idx + 1];
    const score = h('div', { class: 'panel stack-s', style: 'max-width:70ch' });
    const drawScore = () => {
      const n = Object.keys(ex.ans).length, right = Object.values(ex.ans).filter(a => a.res === 'ok').length, total = l.exercises.length;
      if (n < total) return score.replaceChildren(h('b', null, `已答 ${n} / ${total} 题`), meter(n / total));
      const pass = right >= Math.ceil(total * 0.8);
      score.replaceChildren(
        h('h2', null, `得分 ${right} / ${total}`),
        h('p', { class: 'muted' }, pass ? '这一课通过了。' : `还差一点，${Math.ceil(total * 0.8)} 分以上算通过。回头看一遍讲解再做一次。`),
        h('div', { class: 'row-wrap' },
          h('button', { type: 'button', class: 'btn', onclick: () => { ui.ex = null; render(); } }, '重做练习'),
          nextL ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ui.lesson = nextL.id; ui.ex = null; render(); window.scrollTo(0, 0); } }, '下一课：' + nextL.title) : null));
    };
    const answer = (i, res, given, holder) => {
      ex.ans[i] = { res, given };
      dayRec().g++;
      const n = Object.keys(ex.ans).length;
      if (n === l.exercises.length) {
        const right = Object.values(ex.ans).filter(a => a.res === 'ok').length;
        const g = S.gram[l.id];
        g.best = Math.max(g.best || 0, right); g.t = nowMin();
      }
      save();
      holder.replaceWith(exEl(i));
      drawScore();
    };
    const exEl = i => {
      const x = l.exercises[i], a = ex.ans[i], box = h('div', { class: 'ex' });
      const head = h('div', { class: 'row-wrap muted', style: 'font-size:13px' }, `${i + 1}. ${x.type === 'choice' ? '选择' : '填空'}`);
      if (x.type === 'choice') {
        const correct = x.options[x.answer];
        box.append(head, blanked(x.q, a ? correct : '', a ? 'ok' : ''), x.zh ? h('div', { class: 'muted' }, x.zh) : null,
          h('div', { class: 'opts' }, x.options.map((o, k) => h('button', {
            type: 'button', class: 'opt' + (a ? (k === x.answer ? ' right' : k === a.given ? ' wrong' : '') : ''), disabled: !!a, lang: 'es',
            onclick: () => answer(i, k === x.answer ? 'ok' : 'no', k, box),
          }, o))));
      } else {
        const input = h('input', { class: 'field', id: `ex-${l.id}-${i}`, type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'es', placeholder: '填入正确形式', disabled: !!a, value: a ? a.given : '' });
        const submit = () => { if (!a && input.value.trim()) answer(i, check(input.value, x.answer), input.value, box); };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); } });
        box.append(head, blanked(x.q, a ? x.answer[0] : '', a ? 'ok' : ''), x.zh ? h('div', { class: 'muted' }, x.zh) : null,
          h('div', { class: 'fill-row' }, input, a ? null : h('button', { type: 'button', class: 'btn', onclick: submit }, '检查')),
          a ? null : accentBar(input));
      }
      if (a) box.append(h('div', { class: a.res === 'ok' ? 'note-ok' : 'note-no' },
        h('b', null, a.res === 'ok' ? '对了。' : a.res === 'accent' ? '差一点，重音符号不对。' : '不对。'), ' ',
        x.type === 'fill' && a.res !== 'ok' ? h('span', null, '正确答案：', h('span', { class: 'es', lang: 'es' }, x.answer.join(' / ')), '。') : null, ' ', x.why));
      return box;
    };
    const body = h('article', { class: 'prose', html: l.body });
    body.querySelectorAll('table').forEach(t => { const w = h('div', { class: 'table-scroll' }); t.replaceWith(w); w.append(t); });
    body.addEventListener('click', e => { const s = e.target.closest('.es'); if (s && canSpeak()) speak(s.textContent); });
    drawScore();
    const levelNo = G.filter(x => x.level === l.level).indexOf(l) + 1;
    return h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn btn-quiet back', onclick: () => { ui.lesson = null; ui.ex = null; render(); } }, '← 语法目录'),
      h('div', { class: 'stack-s' },
        h('p', { class: 'eyebrow' }, `${l.level} · 第 ${levelNo} 课`),
        h('h1', null, l.title),
        h('p', { class: 'muted', style: 'max-width:65ch' }, l.intro),
        canSpeak() ? h('p', { class: 'muted', style: 'font-size:13px' }, '点讲解里的蓝色西语可以听发音。') : null),
      body,
      h('section', { class: 'stack-s' }, h('h2', null, '例句'),
        h('ul', { class: 'examples' }, l.examples.map(e => h('li', null, spk(e.es), h('div', null, h('span', { class: 'es', lang: 'es' }, e.es), h('span', { class: 'muted' }, e.zh)))))),
      h('section', { class: 'stack-s' }, h('h2', null, '练习'), l.exercises.map((_, i) => exEl(i)), score));
  }

  /* ================= verbs ================= */
  const TENSE = k => Conj.TENSES.find(t => t.k === k);
  function drillPool() {
    const g = S.set.vgroup;
    return Conj.VERBS.filter(([inf]) => g === 'all' || (g === 'irr') === Conj.isIrregular(inf));
  }
  function nextDrill() {
    const tenses = S.set.tenses.filter(TENSE);
    const tk = pick(tenses.length ? tenses : ['pres']);
    let pool = drillPool();
    if (tk === 'imper') pool = pool.filter(([inf]) => !/se$/.test(inf));
    if (!pool.length) pool = Conj.VERBS;
    const [inf, zh] = pick(pool);
    const c = Conj.conjugate(inf);
    let persons = tk === 'imper' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5];
    if (!S.set.vos) persons = persons.filter(p => p !== 4);
    const p = pick(persons);
    const answers = [c[tk][p]];
    if (tk === 'subjImp') answers.push(c.subjImpSe[p]);
    const prev = ui.drill || { right: 0, total: 0, run: 0 };
    ui.drill = { inf, zh, tk, p, c, answers, answered: false, res: null, given: '', typed: false, right: prev.right, total: prev.total, run: prev.run };
  }
  function tenseTable(c, k, hit) {
    const t = TENSE(k), forms = c[k];
    if (!forms) return null;
    return h('div', { class: 'conj-t' },
      h('h3', null, t.zh, ' ', lvChip(t.lv), h('small', { lang: 'es' }, t.es)),
      h('dl', null, forms.map((f, p) => f == null ? null : [
        h('dt', { lang: 'es' }, k === 'imper' ? ['', 'tú', 'usted', 'nosotros', 'vosotros', 'ustedes'][p] : Conj.PERSONS[p].replace(/ \/ .*$/, '').replace('/as', '')),
        h('dd', { class: p === hit ? 'hit' : '', lang: 'es' }, f, k === 'subjImp' ? h('span', { class: 'muted', style: 'font-weight:400' }, ' / ' + c.subjImpSe[p]) : null)])));
  }
  function viewVerbs() {
    const tabs = subtabs([['drill', '变位练习'], ['table', '变位表']], ui.verbTab, v => { ui.verbTab = v; render(); });
    return h('div', { class: 'stack' }, h('div', { class: 'stack-s' }, h('h1', null, '动词变位'), tabs), ui.verbTab === 'drill' ? verbDrill() : verbTable());
  }
  function verbDrill() {
    if (!ui.drill) nextDrill();
    const d = ui.drill, t = TENSE(d.tk);
    const personLabel = d.tk === 'imper' ? ['', 'tú', 'usted', 'nosotros/as', 'vosotros/as', 'ustedes'][d.p] : Conj.PERSONS[d.p];
    const input = h('input', { class: 'field', id: 'drill-in', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'es', placeholder: d.c.refl ? '连同代词一起写，如 me levanto' : '写出变位', disabled: d.answered, value: d.given, oninput: () => { d.typed = !!input.value; } });
    const submit = () => {
      if (d.answered) { nextDrill(); return render(); }
      if (!input.value.trim()) return;
      d.given = input.value; d.res = check(input.value, d.answers); d.answered = true;
      d.total++;
      if (d.res === 'ok') { d.right++; d.run++; } else d.run = 0;
      const st = S.conj[d.tk] || (S.conj[d.tk] = [0, 0]);
      st[1]++; if (d.res === 'ok') st[0]++;
      dayRec().c++;
      save();
      render();
      speak(d.answers[0]);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); } });
    ui.keys = e => { if (d.answered && e.key === 'Enter' && e.target !== input) { e.preventDefault(); submit(); } };
    setTimeout(() => { if (cur === 'verbos' && ui.verbTab === 'drill' && !d.answered) input.focus({ preventScroll: true }); }, 30);

    const toggleTense = k => {
      const s = new Set(S.set.tenses);
      if (s.has(k)) { if (s.size > 1) s.delete(k); } else s.add(k);
      S.set.tenses = Conj.TENSES.map(x => x.k).filter(x => s.has(x));
      saveSettings(); ui.drill = null; render();
    };
    const fb = d.answered ? h('div', { class: d.res === 'ok' ? 'note-ok' : 'note-no' },
      h('b', null, d.res === 'ok' ? '对了' : d.res === 'accent' ? '差一点：重音符号不对' : '不对'), ' ',
      h('span', { class: 'es', lang: 'es', style: 'font-size:1.15rem;font-weight:600' }, d.answers.join(' / '))) : null;
    return h('div', { class: 'stack' },
      h('div', { class: 'study' },
        h('div', { class: 'row-wrap', style: 'justify-content:space-between' },
          h('span', { class: 'muted num' }, `本轮 ${d.right} / ${d.total}` + (d.run >= 3 ? ` · 连对 ${d.run}` : '')),
          h('span', { class: 'muted num' }, `今天 ${dayView().c} 题`)),
        h('div', { class: 'fc', style: 'min-height:0' },
          h('div', { class: 'vq' },
            h('div', { class: 'row-wrap', style: 'justify-content:center' }, h('span', { class: 'v-inf', lang: 'es' }, d.inf), spk(d.inf)),
            h('div', { class: 'muted' }, d.zh),
            h('div', { class: 'v-ask' }, h('span', { class: 'chip' }, t.zh), h('span', { class: 'muted es', lang: 'es', style: 'font-style:italic' }, t.es), '→', h('span', { class: 'v-person', lang: 'es' }, personLabel))),
          h('div', { class: 'fill-row' }, input, h('button', { type: 'button', class: 'btn btn-primary', onclick: submit }, d.answered ? '下一题' : '检查')),
          d.answered ? null : accentBar(input), fb),
        d.answered ? tenseTable(d.c, d.tk, d.p) : null),
      h('div', { class: 'stack-s' },
        h('h2', null, '练哪些时态'),
        h('div', { class: 'pick', role: 'group' }, Conj.TENSES.map(x => {
          const st = S.conj[x.k];
          return h('button', { type: 'button', 'aria-pressed': String(S.set.tenses.includes(x.k)), onclick: () => toggleTense(x.k), title: x.es },
            `${x.zh}` + (st && st[1] >= 5 ? ` ${Math.round(st[0] / st[1] * 100)}%` : ''));
        })),
        h('p', { class: 'muted' }, '百分比是你在这个时态上的累计正确率。'),
        h('div', { class: 'row-wrap' },
          seg([['all', '全部动词'], ['reg', '只练规则'], ['irr', '只练不规则']], S.set.vgroup, v => { S.set.vgroup = v; saveSettings(); ui.drill = null; render(); }),
          seg([[true, '含 vosotros'], [false, '不含 vosotros']], S.set.vos, v => { S.set.vos = v; saveSettings(); ui.drill = null; render(); }))));
  }
  function verbTable() {
    const c = Conj.conjugate(ui.lookup);
    const known = Conj.VERBS.find(([inf]) => inf === ui.lookup.trim().toLowerCase());
    const input = h('input', { class: 'field', id: 'lookup', type: 'text', list: 'verb-list', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'es', value: ui.lookup, placeholder: '输入动词原形，如 tener', 'aria-label': '动词原形' });
    const goLook = () => { ui.lookup = input.value.trim() || 'tener'; render(); };
    input.addEventListener('change', goLook);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') goLook(); });
    return h('div', { class: 'stack' },
      h('div', { class: 'stack-s' },
        h('div', { class: 'fill-row' }, input, h('button', { type: 'button', class: 'btn btn-primary', onclick: goLook }, '查看变位')),
        accentBar(input),
        h('datalist', { id: 'verb-list' }, Conj.VERBS.map(([inf, zh]) => h('option', { value: inf }, zh)))),
      !c ? h('p', { class: 'empty' }, '请输入以 -ar、-er、-ir 结尾的动词原形。') : h('div', { class: 'stack-s' },
        h('div', { class: 'row-wrap' }, h('span', { class: 'es', lang: 'es', style: 'font-size:1.8rem;font-weight:600' }, c.inf), spk(c.inf), known ? h('span', { class: 'muted' }, known[1]) : null),
        h('p', null, '副动词 ', h('b', { class: 'es', lang: 'es' }, c.ger), ' · 过去分词 ', h('b', { class: 'es', lang: 'es' }, c.pp)),
        !known && !c.known ? h('p', { class: 'note-no' }, '这个动词不在内置表里，下面是按规则变位推导的结果；如果它是不规则动词，个别形式可能不准。') : null,
        h('div', { class: 'conj-grid' }, Conj.TENSES.map(t => tenseTable(c, t.k, -1)))));
  }

  /* ================= small words & phrases ================= */
  function viewPhrases() {
    if (ui.session && ui.session.owner === 'frases') return sessionEl();
    const deck = ui.frTab, cats = CATS[deck];
    if (!cats.includes(ui.frCat[deck])) ui.frCat[deck] = cats[0] || '';
    const cat = ui.frCat[deck], items = DECK[deck].filter(c => c.cat === cat);
    const st = count([deck], { cat }), due = dueIds(['x', 'p']);
    const tabs = subtabs([['x', '小词与连接词'], ['p', '场景短句']], deck, v => { ui.frTab = v; render(); });
    const learnIds = () => dueIds([deck], cat).concat(newIds([deck], 10, { cat }));
    const allCount = count(['x', 'p']);
    return h('div', { class: 'stack' },
      h('div', { class: 'stack-s' }, h('h1', null, '小词·短句'),
        h('p', { class: 'muted', style: 'max-width:65ch' }, deck === 'x'
          ? 'bueno、pues、o sea、es que……这些小词本身没多少意思，却让一句话听起来自然。每条都有用法说明和例句。'
          : '按生活场景整理的现成句子，学会就能直接开口。卡片会先给中文，让你自己说出西语。'),
        tabs),
      h('div', { class: 'panel row-wrap', style: 'justify-content:space-between' },
        h('span', null, `小词和短句共 ${allCount.total} 条，已学 ${allCount.learned} 条` + (due.length ? `，${due.length} 条到期` : '')),
        h('button', { type: 'button', class: 'btn', disabled: !due.length, onclick: () => startSession(due.slice(0, 60), 'frases', '复习小词·短句') }, '复习到期的')),
      !cats.length ? h('p', { class: 'empty' }, '内容还没有加载。') : h('div', { class: 'stack-s' },
        h('div', { class: 'pick', role: 'group' }, cats.map(c => h('button', { type: 'button', 'aria-pressed': String(c === cat), onclick: () => { ui.frCat[deck] = c; render(); } }, c))),
        h('div', { class: 'row-wrap', style: 'justify-content:space-between' },
          h('span', { class: 'muted' }, `本组 ${st.total} 条，已学 ${st.learned} 条`),
          h('button', { type: 'button', class: 'btn btn-primary', disabled: !learnIds().length, onclick: () => startSession(learnIds(), 'frases', cat) }, st.learned < st.total ? '用卡片学这一组' : '复习这一组')),
        h('div', null, items.map(c => h('div', { class: 'phrase' },
          h('div', { class: 'phrase-head' }, h('i', { class: 'st s' + status(c.id), style: 'width:9px;height:9px;border-radius:50%;margin-top:11px;flex:none;border:2px solid ' + (status(c.id) === 2 ? 'var(--good)' : status(c.id) === 1 ? 'var(--sun)' : 'var(--line)') + ';background:' + (status(c.id) === 2 ? 'var(--good)' : status(c.id) === 1 ? 'var(--sun)' : 'transparent') }),
            h('span', { class: 'es', lang: 'es' }, c.es), lvChip(c.lv), spk(c.es)),
          h('div', null, c.zh),
          c.note ? h('div', { class: 'p-note' }, c.note) : null,
          c.exEs ? h('div', { class: 'p-ex' }, h('div', { class: 'row-wrap' }, h('span', { class: 'es', lang: 'es' }, c.exEs), spk(c.exEs)), h('div', { class: 'muted' }, c.exZh)) : null)))));
  }

  /* ================= settings ================= */
  function viewSettings() {
    const row = (title, sub, control) => h('div', { class: 'setting' }, h('div', null, h('b', null, title), sub ? h('span', null, sub) : null), control);
    const set = (k, v) => { S.set[k] = v; saveSettings(); render(); };
    const all = count(['v']);
    const voices = speech.voices;
    const voiceSel = voices.length ? select([['', '自动选择']].concat(voices.map(v => [v.name, `${v.name}（${v.lang}）`])), S.set.voice, v => set('voice', v), '朗读声音', 'set-voice') : null;
    const rate = h('input', { type: 'range', id: 'set-rate', min: '0.6', max: '1.2', step: '0.05', value: String(S.set.rate), 'aria-label': '语速', onchange: e => { S.set.rate = +e.target.value; saveSettings(); speak('Hola, ¿qué tal? Vamos a practicar español.'); } });
    const syncText = { local: '进度保存在这台设备的浏览器里。', connecting: '正在连接你的账号…', synced: '进度已同步到你的账号，换设备打开这个页面也能接着学。', saving: '正在同步…', readonly: '当前账号不能写入云端，进度只保存在这台设备上。' }[cloud.status];
    const backupArea = h('textarea', { class: 'field', id: 'backup', 'aria-label': '进度备份', placeholder: '点「导出」生成备份文字；或把之前的备份粘贴到这里再点「导入」' });
    backupArea.value = ui.backup;
    const msg = h('span', { class: 'muted', role: 'status' });
    return h('div', { class: 'stack' },
      h('h1', null, '设置'),
      h('section', { class: 'stack-s' }, h('h2', null, '学习节奏'), h('div', { class: 'panel' },
        row('每天新词', `共 ${all.total} 个词，按这个节奏约 ${Math.ceil((all.total - all.learned) / S.set.goal)} 天学完剩下的`, seg([10, 15, 20, 30, 40].map(n => [n, n]), S.set.goal, v => set('goal', v))),
        row('每天新短句', '小词和场景短句', seg([5, 10, 15].map(n => [n, n]), S.set.pgoal, v => set('pgoal', v))),
        row('词卡方向', '西→中练认读，中→西练主动回忆（更难）', seg([['es', '西语 → 中文'], ['zh', '中文 → 西语']], S.set.dir, v => set('dir', v))),
        row('变位练习含 vosotros', '西班牙本土用 vosotros；只学拉美西语可以关掉', seg([[true, '包含'], [false, '不包含']], S.set.vos, v => set('vos', v))))),
      h('section', { class: 'stack-s' }, h('h2', null, '朗读'), h('div', { class: 'panel' },
        !canSpeak() ? h('p', { class: 'muted' }, '这个浏览器里没有可用的西语朗读声音，所以朗读按钮被隐藏了。在电脑上用 Chrome 或 Safari 打开通常就有。') : [
          row('自动朗读', '出现西语词卡时自动读一遍', seg([[true, '开'], [false, '关']], S.set.auto, v => set('auto', v))),
          voices.length && speech.cap ? row('朗读引擎', '浏览器声音不限次数；Claude 声音更自然但有次数限制', seg([['auto', '浏览器'], ['claude', 'Claude']], S.set.engine === 'claude' ? 'claude' : 'auto', v => set('engine', v))) : null,
          voiceSel ? row('声音', 'es-ES 是西班牙口音，es-MX、es-US 是拉美口音', voiceSel) : null,
          row('语速', '初学可以调慢一点', h('div', { class: 'row-wrap' }, rate, h('button', { type: 'button', class: 'btn', onclick: () => speak('Hola, ¿qué tal? Vamos a practicar español.') }, '试听')))])),
      h('section', { class: 'stack-s' }, h('h2', null, '进度保存'), h('div', { class: 'panel stack-s' },
        h('p', null, syncText),
        backupArea,
        h('div', { class: 'row-wrap' },
          h('button', { type: 'button', class: 'btn', onclick: () => { ui.backup = backupArea.value = JSON.stringify(S); backupArea.select(); if (navigator.clipboard) navigator.clipboard.writeText(backupArea.value).then(() => { msg.textContent = '已复制到剪贴板，找个地方存起来。'; }, () => { msg.textContent = '已生成，请手动复制上面的文字。'; }); else msg.textContent = '已生成，请手动复制上面的文字。'; } }, '导出'),
          h('button', { type: 'button', class: 'btn', onclick: () => { try { const data = JSON.parse(backupArea.value); if (!data || typeof data.cards !== 'object') throw 0; S = mergeState(S, data); writeLocal(); save(); ui.backup = ''; render(); } catch (e) { msg.textContent = '导入失败：这不是有效的备份文字。'; } } }, '导入'),
          msg),
        h('div', { class: 'row-wrap' }, ui.confirmReset
          ? [h('b', { class: 'no' }, '确定清空全部学习进度？这个操作不能撤销。'),
            h('button', { type: 'button', class: 'btn btn-danger', onclick: () => { const keep = S.set; S = defaults(); S.set = keep; ui.confirmReset = false; ui.session = null; ui.drill = null; writeLocal(); save(); render(); } }, '确定清空'),
            h('button', { type: 'button', class: 'btn', onclick: () => { ui.confirmReset = false; render(); } }, '取消')]
          : h('button', { type: 'button', class: 'btn btn-danger', onclick: () => { ui.confirmReset = true; render(); } }, '清空学习进度')))));
  }

  /* ================= router ================= */
  const VIEWS = { hoy: viewHome, vocab: viewVocab, gramatica: viewGrammar, verbos: viewVerbs, frases: viewPhrases, ajustes: viewSettings };
  let cur = 'hoy';
  function render() {
    ui.keys = null;
    const main = $('#main');
    const y = window.scrollY;
    main.replaceChildren(VIEWS[cur]());
    window.scrollTo(0, y);
    document.querySelectorAll('.nav a, .tabbar a').forEach(a => {
      if (a.getAttribute('href') === '#' + cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function route() {
    const name = (location.hash || '').slice(1);
    const next = VIEWS[name] ? name : 'hoy';
    const changed = next !== cur;
    cur = next;
    render();
    if (changed) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', e => { if (ui.keys && !e.metaKey && !e.ctrlKey && !e.altKey) ui.keys(e); });

  loadLocal();
  speechInit();
  route();
  cloudInit();
})();
