const $ = id => document.getElementById(id);
const KIND_NAME = { img: '点图辨认', mcq: '选择题', tf: '判断题' };
const KIND_DESC = { img: '在整副骨架上点出目标骨', mcq: '看图选名与特征归属，四选一', tf: '判断一句解剖描述对错' };
const KIND_ORDER = ['img', 'mcq', 'tf'];
const ROUND_OPTS = [6, 10, 12];
const PREFS_KEY = 'bonequiz.prefs.v1';
const WRONG_KEY = 'bonequiz.wrong.v1';
const HIST_KEY = 'bonequiz.history.v1';

let data = null;
let history = [];
let wrongCount = 0;
const sel = { scopes: new Set(), kinds: new Set(KIND_ORDER), n: 6 };

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

const leaves = () => data.scopes.filter(s => !data.scopes.some(c => c.parent === s.id));
const openLeaves = () => leaves().filter(s => s.open);
const countBy = fn => data.questions.filter(fn).length;

function acc(fn) {
  const rows = history.filter(fn);
  if (!rows.length) return null;
  const ok = rows.filter(r => r.ok).length;
  return { ok, total: rows.length, pct: Math.round((ok / rows.length) * 100) };
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ scopes: [...sel.scopes], kinds: [...sel.kinds], n: sel.n }));
  } catch { }
}

function loadPrefs() {
  const p = loadJSON(PREFS_KEY, null);
  if (!p) return;
  if (Array.isArray(p.kinds)) {
    const kinds = p.kinds.filter(k => KIND_ORDER.includes(k));
    sel.kinds = new Set(kinds);
  }
  if (Array.isArray(p.scopes)) {
    sel.scopes = new Set(p.scopes.filter(id => openLeaves().some(s => s.id === id)));
  }
  if (ROUND_OPTS.includes(p.n)) sel.n = p.n;
}

function renderRound() {
  const box = $('roundChips');
  box.replaceChildren();
  for (const n of ROUND_OPTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'schip';
    btn.classList.toggle('on', sel.n === n);
    btn.setAttribute('aria-pressed', String(sel.n === n));
    btn.textContent = `${n} 题`;
    btn.addEventListener('click', () => {
      sel.n = n;
      savePrefs();
      renderRound();
      renderSummary();
    });
    box.appendChild(btn);
  }
}

function renderScopes() {
  const box = $('scopeChips');
  box.replaceChildren();
  for (const s of data.scopes) {
    const children = data.scopes.filter(c => c.parent === s.id);
    const isParent = children.length > 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'schip';
    const name = document.createElement('span');
    name.textContent = s.name;
    btn.appendChild(name);

    if (isParent) {
      const openKids = children.filter(c => c.open);
      const allOn = openKids.length > 0 && openKids.every(c => sel.scopes.has(c.id));
      btn.classList.toggle('on', allOn);
      btn.setAttribute('aria-pressed', String(allOn));
      btn.addEventListener('click', () => {
        for (const c of openKids) {
          if (allOn) sel.scopes.delete(c.id); else sel.scopes.add(c.id);
        }
        savePrefs();
        renderScopes();
        renderSummary();
      });
    } else if (!s.open || countBy(q => q.scope === s.id) === 0) {
      btn.disabled = true;
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = '筹备中 · 0 题';
      btn.appendChild(cnt);
    } else {
      const on = sel.scopes.has(s.id);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = `${countBy(q => q.scope === s.id)} 题`;
      btn.appendChild(cnt);
      if (s.note) btn.title = s.note;
      btn.addEventListener('click', () => {
        if (on) sel.scopes.delete(s.id); else sel.scopes.add(s.id);
        savePrefs();
        renderScopes();
        renderSummary();
      });
    }
    box.appendChild(btn);
  }
}

function renderKinds() {
  const box = $('kindRows');
  box.replaceChildren();
  for (const k of KIND_ORDER) {
    const label = document.createElement('label');
    label.className = 'kindrow';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = sel.kinds.has(k);
    cb.addEventListener('change', () => {
      if (cb.checked) sel.kinds.add(k); else sel.kinds.delete(k);
      savePrefs();
      renderSummary();
    });
    const text = document.createElement('span');
    text.className = 'ktext';
    const name = document.createElement('strong');
    name.textContent = KIND_NAME[k];
    const desc = document.createElement('small');
    desc.textContent = KIND_DESC[k];
    text.append(name, desc);
    const meta = document.createElement('span');
    meta.className = 'kmeta';
    const n = countBy(q => q.kind === k);
    const a = acc(r => r.kind === k);
    meta.textContent = a ? `${n} 题 · 准确率 ${a.pct}%` : `${n} 题`;
    label.append(cb, text, meta);
    box.appendChild(label);
  }
}

function poolSize() {
  const scopes = sel.scopes.size ? sel.scopes : new Set(openLeaves().map(s => s.id));
  return countBy(q => scopes.has(q.scope) && sel.kinds.has(q.kind));
}

function renderSummary() {
  const scopeText = sel.scopes.size
    ? data.scopes.filter(s => sel.scopes.has(s.id)).map(s => s.name).join(' + ')
    : '人体（全部已开放范围）';
  const kindText = KIND_ORDER.filter(k => sel.kinds.has(k)).map(k => KIND_NAME[k]).join(' / ');
  const pool = poolSize();
  const n = Math.min(sel.n, pool);
  const btn = $('startBtn');
  const reason = $('startReason');

  let block = '';
  if (!sel.kinds.size) block = '至少勾选一种题目类型才能开始';
  else if (pool === 0) block = '所选范围内没有可练的题目，换个范围试试';

  $('summary').textContent = block ? '' : `本轮：${scopeText} · ${kindText} · ${n} 题${pool < sel.n ? `（题库不足 ${sel.n} 题，已自动缩减）` : ''}`;
  btn.disabled = Boolean(block);
  reason.hidden = !block;
  reason.textContent = block;

  const retry = $('retryEntry');
  retry.hidden = wrongCount === 0;
  retry.textContent = `重练错题（${wrongCount}）`;
  $('wrongHint').hidden = wrongCount === 0;
}

function statRow(name, a, extra) {
  const row = document.createElement('div');
  row.className = 'statrow';
  const label = document.createElement('span');
  label.className = 'stat-name';
  label.textContent = name;
  const bar = document.createElement('span');
  bar.className = 'bar';
  const fill = document.createElement('span');
  fill.className = 'bar-fill';
  fill.style.width = a ? `${a.pct}%` : '0%';
  bar.appendChild(fill);
  const val = document.createElement('span');
  val.className = 'stat-val';
  if (extra) {
    val.textContent = extra;
    val.classList.add('muted');
  } else if (a) {
    val.textContent = `${a.pct}%（${a.ok}/${a.total}）`;
  } else {
    val.textContent = '暂无记录';
    val.classList.add('muted');
  }
  row.append(label, bar, val);
  return row;
}

function renderStats() {
  const overall = acc(() => true);
  $('overallPct').textContent = overall ? `${overall.pct}%` : '—';
  $('overallMeta').textContent = overall
    ? `共作答 ${overall.total} 题 · 答对 ${overall.ok} 题`
    : '暂无答题记录，练一轮就有数据了';

  const scopeBox = $('scopeStats');
  scopeBox.replaceChildren();
  for (const s of leaves()) {
    if (!s.open) {
      scopeBox.appendChild(statRow(s.name, null, '筹备中'));
    } else {
      scopeBox.appendChild(statRow(s.name, acc(r => r.scope === s.id)));
    }
  }
  const kindBox = $('kindStats');
  kindBox.replaceChildren();
  for (const k of KIND_ORDER) {
    kindBox.appendChild(statRow(KIND_NAME[k], acc(r => r.kind === k)));
  }
}

async function init() {
  try {
    const res = await fetch('assets/questions.json', { cache: 'no-store' });
    data = await res.json();
  } catch {
    $('summary').textContent = '题库加载失败，请刷新重试';
    $('startBtn').disabled = true;
    return;
  }
  history = loadJSON(HIST_KEY, []);
  if (!Array.isArray(history)) history = [];
  const wrong = loadJSON(WRONG_KEY, []);
  wrongCount = Array.isArray(wrong) ? wrong.filter(id => data.questions.some(q => q.id === id)).length : 0;

  loadPrefs();
  renderScopes();
  renderKinds();
  renderRound();
  renderSummary();
  renderStats();

  $('startBtn').addEventListener('click', () => {
    const p = new URLSearchParams();
    if (sel.scopes.size) p.set('scope', [...sel.scopes].join(','));
    if (sel.kinds.size < KIND_ORDER.length) p.set('kind', KIND_ORDER.filter(k => sel.kinds.has(k)).join(','));
    p.set('n', String(sel.n));
    location.href = `quiz.html?${p.toString()}`;
  });
  $('retryEntry').addEventListener('click', () => { location.href = 'quiz.html?mode=retry'; });
}

init();