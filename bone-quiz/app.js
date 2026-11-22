const $ = id => document.getElementById(id);
const KIND_NAME = { img: '点图辨认', mcq: '选择题', tf: '判断题' };
const KIND_ORDER = ['img', 'mcq', 'tf'];
const WRONG_KEY = 'bonequiz.wrong.v1';
const HIST_KEY = 'bonequiz.history.v1';
const HW = 400, HH = 1054; // 命中检测用半分辨率掩膜
const TOL = 13;           // 半分辨率下的容差（约屏幕 6–8px）
const LENS_Z = 3, LENS_R = 66;

const state = {
  all: [], scopes: [], order: [], idx: 0, correct: 0, streak: 0,
  mode: 'normal', locked: false, frame: { w: 800, h: 2108 }, ver: 1, body: '',
  wrong: new Set(), roundAnswers: [], masks: null, lensOn: false,
  cursor: null,
  cfg: { scopes: new Set(), kinds: new Set(KIND_ORDER), n: 6 },
};

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* 隐私模式下仅用内存 */ }
}

loadJSON(WRONG_KEY, []).forEach(id => state.wrong.add(id));
const saveWrong = () => saveJSON(WRONG_KEY, [...state.wrong]);

function record(q, ok) {
  const hist = loadJSON(HIST_KEY, []);
  hist.push({ id: q.id, scope: q.scope, kind: q.kind, ok, t: Date.now() });
  saveJSON(HIST_KEY, hist.slice(-500));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseConfig() {
  const p = new URLSearchParams(location.search);
  state.mode = p.get('mode') === 'retry' ? 'retry' : 'normal';
  const openLeaves = state.scopes.filter(s => s.open && !state.scopes.some(c => c.parent === s.id));
  const scopeParam = (p.get('scope') || '').split(',').filter(Boolean);
  const validScopes = scopeParam.filter(id => openLeaves.some(s => s.id === id));
  state.cfg.scopes = new Set(validScopes.length ? validScopes : openLeaves.map(s => s.id));
  const kindParam = (p.get('kind') || '').split(',').filter(k => KIND_ORDER.includes(k));
  state.cfg.kinds = new Set(kindParam.length ? kindParam : KIND_ORDER);
  const n = parseInt(p.get('n'), 10);
  state.cfg.n = Number.isFinite(n) ? Math.min(Math.max(n, 1), 50) : 6;
}

function buildOrder() {
  const pool = state.mode === 'retry'
    ? state.all.filter(q => state.wrong.has(q.id))
    : state.all.filter(q => state.cfg.scopes.has(q.scope) && state.cfg.kinds.has(q.kind));
  // 各题型内部打乱后轮转穿插，保证勾选的每种题型都出现，再截取本轮题数
  const groups = KIND_ORDER.map(k => shuffle(pool.filter(q => q.kind === k))).filter(g => g.length);
  const mixed = [];
  for (let i = 0; mixed.length < pool.length; i++) {
    for (const g of groups) if (g[i]) mixed.push(g[i]);
  }
  return shuffle(mixed.slice(0, state.cfg.n));
}

function scopeLabel() {
  if (!state.cfg.scopes.size) return '所选范围';
  const openLeaves = state.scopes.filter(s => s.open && !state.scopes.some(c => c.parent === s.id));
  if (state.cfg.scopes.size >= openLeaves.length) return '人体（全部范围）';
  return state.scopes.filter(s => state.cfg.scopes.has(s.id)).map(s => s.name).join(' + ');
}

/* ---- 掩膜加载与命中 ---- */
function loadMasks() {
  const targets = [...new Set(state.all.filter(q => q.kind === 'img').map(q => q.target))];
  const jobs = targets.map(t => new Promise(res => {
    const q = state.all.find(x => x.kind === 'img' && x.target === t);
    const im = new Image();
    const done = () => {
      const cv = document.createElement('canvas');
      cv.width = HW; cv.height = HH;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(im, 0, 0, HW, HH);
      const d = ctx.getImageData(0, 0, HW, HH).data;
      const a = new Uint8Array(HW * HH);
      let px = 0, sx = 0, sy = 0, mid = 0, rn = 0, rx = 0, ry = 0;
      let x0 = HW, y0 = HH, x1 = 0, y1 = 0;
      const samples = [];
      for (let y = 0; y < HH; y++) {
        for (let x = 0; x < HW; x++) {
          const v = d[(y * HW + x) * 4 + 3];
          if (v > 16) {
            a[y * HW + x] = 1;
            px++; sx += x; sy += y;
            if (Math.abs(x - HW / 2) <= 3) mid++;
            if (x >= HW / 2) { rn++; rx += x; ry += y; }
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            if ((x + y) % 3 === 0) samples.push(x, y);
          }
        }
      }
      // 成对骨左右两簇的质心落在中线（如髋骨落在骶骨上），标签改放右侧实例；
      // 中线像素占比极低且两侧均占两成以上才视为成对（耻骨联合等少量中线像素不影响判定）
      const paired = mid / px < 0.05 && rn > px * 0.2 && (px - rn) > px * 0.2;
      let cx = (paired ? rx / rn : sx / px) * 2;
      let cy = (paired ? ry / rn : sy / px) * 2;
      // 质心可能落在骨孔（如闭孔）里，吸附到最近实心像素再放标签
      const hx = Math.round(cx / 2), hy = Math.round(cy / 2);
      if (!a[hy * HW + hx]) {
        outer: for (let r = 2; r <= 60; r += 2) {
          for (let dy = -r; dy <= r; dy += 2) {
            for (let dx = -r; dx <= r; dx += 2) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              const x = hx + dx, y = hy + dy;
              const solid = (xx, yy) => xx >= 0 && yy >= 0 && xx < HW && yy < HH && a[yy * HW + xx];
              if (solid(x, y) && solid(x - 2, y) && solid(x + 2, y) && solid(x, y - 2) && solid(x, y + 2)) {
                cx = x * 2; cy = y * 2;
                break outer;
              }
            }
          }
        }
      }
      res({
        id: t, name: q.name, mask: q.mask, a, px, samples, cx, cy,
        bbox: [x0 * 2, y0 * 2, x1 * 2, y1 * 2],
      });
    };
    im.onload = done;
    im.onerror = () => res(null);
    im.src = `assets/${q.mask}?v=${state.ver}`;
    if (im.complete && im.naturalWidth) done();
  }));
  Promise.all(jobs).then(list => {
    const ok = list.filter(Boolean);
    ok.sort((a, b) => a.px - b.px); // 小骨优先：重叠区（如髌骨覆股骨）判给小骨
    state.masks = ok;
  });
}

function maskAt(hx, hy) {
  for (const m of state.masks) {
    if (hx < 0 || hy < 0 || hx >= HW || hy >= HH) return null;
    if (m.a[hy * HW + hx]) return m;
  }
  return null;
}

function hitTest(x, y) {
  const hx = Math.floor(x * HW / state.frame.w);
  const hy = Math.floor(y * HH / state.frame.h);
  const direct = maskAt(hx, hy);
  if (direct) return direct;
  let best = null, bestD = TOL * TOL;
  for (const m of state.masks) {
    const [x0, y0, x1, y1] = m.bbox;
    if (x < x0 - TOL * 2 || x > x1 + TOL * 2 || y < y0 - TOL * 2 || y > y1 + TOL * 2) continue;
    const s = m.samples;
    for (let i = 0; i < s.length; i += 2) {
      const dx = s[i] - hx, dy = s[i + 1] - hy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = m; }
    }
  }
  return best;
}

/* ---- 渲染 ---- */
function renderSegments() {
  const box = $('pSeg');
  box.replaceChildren();
  for (let i = 0; i < state.order.length; i++) box.appendChild(document.createElement('span'));
  paintSegments();
}
function paintSegments() {
  const kids = $('pSeg').children;
  for (let i = 0; i < kids.length; i++) {
    const a = state.roundAnswers[i];
    kids[i].className = a ? (a.ok ? 'ok' : 'bad') : (i === state.idx ? 'now' : '');
  }
}

function startRound(mode) {
  state.mode = mode;
  state.order = buildOrder();
  state.idx = 0;
  state.correct = 0;
  state.streak = 0;
  state.roundAnswers = [];
  $('modeChip').hidden = mode !== 'retry';
  $('quizSub').textContent = mode === 'retry'
    ? '错题重练 · 不限范围与题型'
    : `${scopeLabel()} · ${KIND_ORDER.filter(k => state.cfg.kinds.has(k)).map(k => KIND_NAME[k]).join(' / ')}`;
  $('resultView').hidden = true;
  $('quizView').hidden = false;
  renderSegments();
  if (!state.order.length) {
    $('questionText').textContent = mode === 'retry' ? '错题本是空的，先练一轮吧' : '当前筛选下没有可练的题目';
    $('stepText').textContent = '0 / 0';
    $('scoreText').textContent = '答对 0';
    $('streakChip').hidden = true;
    $('hintBtn').hidden = true;
    $('lensBtn').hidden = true;
    $('hintCard').hidden = true;
    $('imgArea').hidden = true;
    $('mcqFig').hidden = true;
    $('choiceArea').hidden = true;
    $('feedback').hidden = true;
    return;
  }
  renderQuestion();
}

function clearReveal() {
  for (const id of ['revealOk', 'revealBad']) {
    const el = $(id);
    el.classList.remove('on');
    el.style.maskImage = '';
    el.style.webkitMaskImage = '';
  }
  for (const id of ['tagOk', 'tagBad']) $(id).classList.remove('on');
  $('overlay').replaceChildren();
  $('stage').classList.remove('revealed');
}

function renderQuestion() {
  const q = state.order[state.idx];
  state.locked = false;
  state.cursor = null;
  $('stage').classList.remove('locked', 'shake');
  $('stepText').textContent = `第 ${state.idx + 1} / ${state.order.length} 题`;
  $('scoreText').textContent = `答对 ${state.correct}`;
  $('reviewChip').hidden = q.reviewed !== false;
  $('feedback').hidden = true;
  $('toast').hidden = true;
  $('hintCard').hidden = true;
  $('hintBtn').setAttribute('aria-expanded', 'false');
  $('lens').classList.remove('on');
  clearReveal();
  paintSegments();

  const isImg = q.kind === 'img';
  $('imgArea').hidden = !isImg;
  $('mcqFig').hidden = !q.img;
  $('choiceArea').hidden = isImg;
  $('hintBtn').hidden = !q.hint;
  $('lensBtn').hidden = !isImg;
  $('questionText').classList.toggle('long', !isImg);
  $('hintText').textContent = q.hint || '';

  if (isImg) {
    $('imgLabel').textContent = `${q.label} · 16 种目标骨可点，左右侧均算对`;
    $('questionText').textContent = `请点击图中的${q.name}`;
    $('stage').setAttribute('aria-label', `人体骨架前面观，点击${q.name}`);
    $('kbdNote').innerHTML = '<kbd>方向键</kbd> 移动准星 · <kbd>Enter</kbd> 确认 · <kbd>H</kbd> 提示';
  } else {
    if (q.img) $('mcqImg').src = `assets/${q.img}?v=${state.ver}`;
    $('questionText').textContent = q.kind === 'mcq' ? q.stem : q.statement;
    $('kbdNote').innerHTML = q.kind === 'mcq'
      ? '<kbd>1</kbd>–<kbd>4</kbd> 或 <kbd>A</kbd>–<kbd>D</kbd> 选择 · <kbd>Enter</kbd> 下一题'
      : '<kbd>1</kbd> 正确 · <kbd>2</kbd> 错误 · <kbd>Enter</kbd> 下一题';
    const area = $('choiceArea');
    area.replaceChildren();
    area.classList.toggle('tfrow', q.kind === 'tf');
    const opts = q.kind === 'mcq'
      ? q.options.map((text, i) => ({ text, val: i, key: 'ABCD'[i] }))
      : [{ text: '正确', val: true, key: '1' }, { text: '错误', val: false, key: '2' }];
    for (const o of opts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt';
      btn.dataset.val = String(o.val);
      const key = document.createElement('span');
      key.className = 'opt-key';
      key.textContent = o.key;
      const label = document.createElement('span');
      label.textContent = o.text;
      btn.append(key, label);
      area.appendChild(btn);
    }
  }
}

function toast(msg) {
  $('toast').textContent = msg;
  $('toast').hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { $('toast').hidden = true; }, 1200);
}

function stagePoint(ev) {
  const rect = $('stage').getBoundingClientRect();
  return [
    ((ev.clientX - rect.left) / rect.width) * state.frame.w,
    ((ev.clientY - rect.top) / rect.height) * state.frame.h,
  ];
}

function answerAt(x, y) {
  if (state.locked || $('imgArea').hidden) return;
  if (!state.masks) { toast('骨架掩膜加载中，稍候再点'); return; }
  const q = state.order[state.idx];
  const hit = hitTest(x, y);
  if (!hit) {
    const stage = $('stage');
    stage.classList.remove('shake');
    void stage.offsetWidth;
    stage.classList.add('shake');
    toast('请点在骨头上');
    return;
  }
  const ok = hit.id === q.target;
  reveal(q, hit, ok, x, y);
  judge(q, ok, ok ? '答对了！' : `答错了：你点的是${hit.name}，题目要找${q.name}`);
}

function onStageClick(ev) {
  const [x, y] = stagePoint(ev);
  answerAt(x, y);
}

function reveal(q, hit, ok, x, y) {
  const target = state.masks.find(m => m.id === q.target);
  const setMask = (el, m) => {
    const url = `url("assets/${m.mask}?v=${state.ver}")`;
    el.style.maskImage = url;
    el.style.webkitMaskImage = url;
    el.classList.add('on');
  };
  const setTag = (el, m) => {
    el.textContent = m.name;
    el.style.left = `${(m.cx / state.frame.w) * 100}%`;
    el.style.top = `${(m.cy / state.frame.h) * 100}%`;
    el.classList.add('on');
    return m;
  };
  $('stage').classList.add('revealed');
  setMask($('revealOk'), target);
  const tOk = setTag($('tagOk'), target);
  if (!ok && hit.id !== q.target) {
    setMask($('revealBad'), hit);
    const tBad = setTag($('tagBad'), hit);
    if (Math.abs(tOk.cy - tBad.cy) / state.frame.h < 0.06 && Math.abs(tOk.cx - tBad.cx) / state.frame.w < 0.2) {
      $('tagBad').style.top = `${Math.min((tBad.cy / state.frame.h) * 100 + 7, 96)}%`;
    }
  }
  const NS = 'http://www.w3.org/2000/svg';
  const ov = $('overlay');
  ov.replaceChildren();
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('cx', x); ring.setAttribute('cy', y); ring.setAttribute('r', 30);
  ring.setAttribute('class', `tap-ring ${ok ? 'ok' : 'bad'}`);
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 7);
  dot.setAttribute('class', `tap-dot ${ok ? 'ok' : 'bad'}`);
  ov.append(ring, dot);
}

function drawCursor() {
  const NS = 'http://www.w3.org/2000/svg';
  const ov = $('overlay');
  ov.replaceChildren();
  if (!state.cursor || state.locked) return;
  const [x, y] = state.cursor;
  const mk = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    ov.appendChild(el);
  };
  mk('line', { x1: x - 46, y1: y, x2: x + 46, y2: y, class: 'cross' });
  mk('line', { x1: x, y1: y - 46, x2: x, y2: y + 46, class: 'cross' });
  mk('circle', { cx: x, cy: y, r: 16, class: 'cross-ring' });
}

function onStageKey(ev) {
  if (state.locked || $('imgArea').hidden) return;
  const step = ev.shiftKey ? 60 : 20;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[ev.key]) {
    ev.preventDefault();
    const c = state.cursor || [state.frame.w / 2, state.frame.h / 2];
    state.cursor = [
      Math.min(Math.max(c[0] + moves[ev.key][0], 0), state.frame.w),
      Math.min(Math.max(c[1] + moves[ev.key][1], 0), state.frame.h),
    ];
    drawCursor();
  } else if (ev.key === 'Enter' || ev.key === ' ') {
    if (!state.cursor) return;
    ev.preventDefault();
    answerAt(state.cursor[0], state.cursor[1]);
  }
}

function onChoiceClick(ev) {
  const btn = ev.target.closest('.opt');
  if (!btn || state.locked || $('choiceArea').hidden) return;
  const q = state.order[state.idx];
  const chosen = q.kind === 'mcq' ? Number(btn.dataset.val) : btn.dataset.val === 'true';
  const ok = chosen === q.answer;
  for (const b of $('choiceArea').querySelectorAll('.opt')) {
    b.disabled = true;
    const val = q.kind === 'mcq' ? Number(b.dataset.val) : b.dataset.val === 'true';
    if (val === q.answer) b.classList.add('opt-ok');
    else if (b === btn) b.classList.add('opt-bad');
  }
  let bad;
  if (q.kind === 'mcq') bad = `答错了：正确答案是 ${'ABCD'[q.answer]}. ${q.options[q.answer]}`;
  else bad = `答错了：这句话是${q.answer ? '正确' : '错误'}的`;
  judge(q, ok, ok ? '答对了！' : bad);
}

function judge(q, ok, verdictText) {
  state.locked = true;
  $('stage').classList.add('locked');
  $('lens').classList.remove('on');
  if (ok) {
    state.correct++;
    state.streak++;
    state.wrong.delete(q.id);
  } else {
    state.streak = 0;
    state.wrong.add(q.id);
  }
  saveWrong();
  record(q, ok);
  state.roundAnswers.push({ q, ok });
  const chip = $('streakChip');
  chip.hidden = state.streak < 2;
  chip.textContent = `连对 ${state.streak}`;
  if (!chip.hidden) {
    chip.classList.remove('pop');
    void chip.offsetWidth;
    chip.classList.add('pop');
  }
  const score = $('scoreText');
  score.textContent = `答对 ${state.correct}`;
  score.classList.remove('pulse');
  void score.offsetWidth;
  score.classList.add('pulse');
  paintSegments();
  const verdict = $('verdict');
  verdict.className = `verdict ${ok ? 'ok' : 'bad'}`;
  verdict.textContent = verdictText;
  $('explain').textContent = q.explain;
  $('kbLink').hidden = !q.bone;
  if (q.bone) $('kbLink').href = `kb-bone.html?bone=${q.bone}`;
  $('nextBtn').textContent = state.idx + 1 < state.order.length ? '下一题' : '查看结果';
  $('feedback').hidden = false;
  $('feedback').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function next() {
  if (state.idx + 1 < state.order.length) {
    state.idx++;
    renderQuestion();
  } else {
    finish();
  }
}

function correctText(q) {
  if (q.kind === 'img') return q.name;
  if (q.kind === 'mcq') return q.options[q.answer];
  return q.answer ? '正确' : '错误';
}

function finish() {
  $('quizView').hidden = true;
  $('resultView').hidden = false;
  const total = state.order.length;
  const target = state.correct;
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min((now - t0) / 550, 1);
    const v = Math.round(target * (1 - Math.pow(1 - p, 3)));
    $('bigScore').textContent = `${v} / ${total}`;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const wrongNow = state.roundAnswers.filter(a => !a.ok);
  $('resultNote').textContent = wrongNow.length === 0
    ? '全对！各个角度、各种题型都拿下了，换一批范围继续挑战。'
    : `本轮 ${wrongNow.length} 道错题已收进错题本（共 ${state.wrong.size} 道），重练答对即自动移出。`;
  const bd = $('kindBreakdown');
  bd.replaceChildren();
  for (const k of KIND_ORDER) {
    const ans = state.roundAnswers.filter(a => a.q.kind === k);
    if (!ans.length) continue;
    const row = document.createElement('div');
    row.className = 'bd-row';
    const name = document.createElement('span');
    name.textContent = KIND_NAME[k];
    const val = document.createElement('span');
    val.className = 'bd-val';
    val.textContent = `${ans.filter(a => a.ok).length} / ${ans.length}`;
    row.append(name, val);
    bd.appendChild(row);
  }
  const card = $('wrongCard');
  const list = $('wrongList');
  list.replaceChildren();
  card.hidden = wrongNow.length === 0;
  for (const { q } of wrongNow) {
    const row = document.createElement('div');
    row.className = 'wr-row';
    const top = document.createElement('div');
    top.className = 'wr-top';
    const kind = document.createElement('span');
    kind.className = 'chip wr-kind';
    kind.textContent = KIND_NAME[q.kind];
    const stem = document.createElement('span');
    stem.className = 'wr-stem';
    stem.textContent = q.kind === 'img' ? `点出${q.name}` : (q.kind === 'mcq' ? q.stem : q.statement);
    top.append(kind, stem);
    const ans = document.createElement('span');
    ans.className = 'wr-ans';
    ans.textContent = `正确：${correctText(q)}`;
    row.append(top, ans);
    if (q.bone) {
      const link = document.createElement('a');
      link.className = 'wr-kb';
      link.href = `kb-bone.html?bone=${q.bone}`;
      link.textContent = '去知识库看这块骨 →';
      row.appendChild(link);
    }
    list.appendChild(row);
  }
  $('retryBtn').hidden = state.wrong.size === 0;
  $('retryBtn').textContent = `重练错题（${state.wrong.size}）`;
  $('resultView').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---- 放大镜 ---- */
function moveLens(ev) {
  if (!state.lensOn || state.locked || $('imgArea').hidden) return;
  const stage = $('stage');
  const rect = stage.getBoundingClientRect();
  const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
  const lens = $('lens');
  const R = (lens.offsetWidth || LENS_R * 2) / 2;
  lens.style.backgroundImage = `url("assets/${state.body}?v=${state.ver}")`;
  lens.style.backgroundSize = `${rect.width * LENS_Z}px ${rect.height * LENS_Z}px`;
  lens.style.backgroundPosition = `${-(px * LENS_Z - R)}px ${-(py * LENS_Z - R)}px`;
  lens.style.left = `${Math.min(Math.max(px - R, 4), rect.width - R * 2 - 4)}px`;
  lens.style.top = `${py < R * 2 + 20 ? py + 18 : py - R * 2 - 18}px`;
  lens.classList.add('on');
}

function onKey(ev) {
  if (ev.target instanceof Element && ev.target.closest('input, textarea')) return;
  if (!$('resultView').hidden) return;
  if (state.locked) {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); next(); }
    return;
  }
  const q = state.order[state.idx];
  if (!q) return;
  if (ev.key === 'h' || ev.key === 'H') {
    if (!$('hintBtn').hidden) $('hintBtn').click();
    return;
  }
  if (q.kind === 'img') return; // 方向键由 stage 焦点处理
  const opts = [...$('choiceArea').querySelectorAll('.opt')];
  let i = -1;
  if (q.kind === 'mcq') {
    if (/^[1-4]$/.test(ev.key)) i = Number(ev.key) - 1;
    else if (/^[a-dA-D]$/.test(ev.key)) i = ev.key.toLowerCase().charCodeAt(0) - 97;
  } else if (ev.key === '1' || ev.key === '2') i = Number(ev.key) - 1;
  if (i >= 0 && opts[i]) { ev.preventDefault(); opts[i].click(); }
}

async function init() {
  let data;
  try {
    const res = await fetch('assets/questions.json', { cache: 'no-store' });
    data = await res.json();
  } catch {
    $('questionText').textContent = '题目加载失败，请刷新重试';
    return;
  }
  state.all = data.questions;
  state.scopes = data.scopes || [];
  state.frame = data.frame || { w: 800, h: 2108 };
  state.ver = data.ver || 1;
  state.body = data.body;
  $('boneImg').src = `assets/${state.body}?v=${state.ver}`;
  $('overlay').setAttribute('viewBox', `0 0 ${state.frame.w} ${state.frame.h}`);
  parseConfig();
  loadMasks();
  $('stage').addEventListener('click', onStageClick);
  $('stage').addEventListener('keydown', onStageKey);
  $('stage').addEventListener('pointermove', moveLens);
  $('stage').addEventListener('pointerleave', () => $('lens').classList.remove('on'));
  $('choiceArea').addEventListener('click', onChoiceClick);
  $('nextBtn').addEventListener('click', next);
  $('againBtn').addEventListener('click', () => startRound('normal'));
  $('retryBtn').addEventListener('click', () => startRound('retry'));
  $('hintBtn').addEventListener('click', () => {
    const card = $('hintCard');
    card.hidden = !card.hidden;
    $('hintBtn').setAttribute('aria-expanded', String(!card.hidden));
  });
  $('lensBtn').addEventListener('click', () => {
    state.lensOn = !state.lensOn;
    $('lensBtn').setAttribute('aria-pressed', String(state.lensOn));
    $('lensBtn').classList.toggle('on', state.lensOn);
    if (!state.lensOn) $('lens').classList.remove('on');
  });
  document.addEventListener('keydown', onKey);
  startRound(state.mode);
}

init();