const $ = (s) => document.querySelector(s);
const LEARN_KEY = 'bonequiz.learn.v1';
const VIEW_NAMES = { front: '前面', side: '侧面', back: '后面' };
const displayName = (cn) => cn.replace(/_/g, ' · ');

function loadDone() {
  try {
    const v = JSON.parse(localStorage.getItem(LEARN_KEY));
    return Array.isArray(v && v.done) ? v.done.filter((id) => typeof id === 'string') : [];
  } catch { return []; }
}
const done = new Set(loadDone());
function saveDone() {
  try { localStorage.setItem(LEARN_KEY, JSON.stringify({ done: [...done], t: Date.now() })); } catch { /* 隐私模式下仅用内存 */ }
}

function setBar(fill, wrap, now, total, label) {
  fill.style.width = `${total ? (now / total) * 100 : 0}%`;
  wrap.setAttribute('aria-valuemax', String(total));
  wrap.setAttribute('aria-valuenow', String(now));
  wrap.setAttribute('aria-label', label);
}

fetch('assets/bones.json', { cache: 'no-store' })
  .then((r) => r.json())
  .then((data) => {
    if (document.body.dataset.page === 'learn') initHome(data);
    else initPath(data);
  });

function initHome(data) {
  const total = data.bones.length;
  const learned = data.bones.filter((b) => done.has(b.id)).length;
  $('#doneBig').textContent = String(learned);
  $('#doneMeta').textContent = `/ ${total} 种已学`;
  $('#totalChip').textContent = `已学 ${learned} / ${total}`;
  setBar($('#totalBar'), $('#totalBarWrap'), learned, total, '全部骨学习进度');

  const grid = $('#learnCats');
  data.cats.forEach((c) => {
    const peers = data.bones.filter((b) => b.cat === c.id);
    const n = peers.length;
    const k = peers.filter((b) => done.has(b.id)).length;

    const a = document.createElement('a');
    a.className = 'learn-cat';
    a.href = `learn-path.html?cat=${c.id}`;
    a.setAttribute('aria-label', `${c.name}，已学 ${k} / ${n} 种，进入学习`);

    const head = document.createElement('div');
    head.className = 'lc-head';
    const strong = document.createElement('strong');
    strong.textContent = c.name;
    const small = document.createElement('small');
    small.textContent = `${c.pieces} · 收录 ${n} 种`;
    head.append(strong, small);

    const blurb = document.createElement('p');
    blurb.className = 'lc-blurb';
    blurb.textContent = c.blurb;

    const prog = document.createElement('div');
    prog.className = 'lc-progress';
    const barWrap = document.createElement('div');
    barWrap.className = 'bar';
    barWrap.setAttribute('role', 'progressbar');
    barWrap.setAttribute('aria-valuemin', '0');
    const fill = document.createElement('span');
    fill.className = 'bar-fill';
    barWrap.appendChild(fill);
    setBar(fill, barWrap, k, n, `${c.name}学习进度`);
    const val = document.createElement('span');
    val.className = 'stat-val';
    val.textContent = `${k} / ${n}`;
    prog.append(barWrap, val);

    const go = document.createElement('span');
    go.className = 'lc-go';
    go.textContent = k === 0 ? '开始学习 →' : k >= n ? '已全部学完 · 复习 →' : '继续学习 →';

    a.append(head, blurb, prog, go);
    grid.appendChild(a);
  });
}

function initPath(data) {
  const p = new URLSearchParams(location.search);
  const cat = data.cats.find((c) => c.id === p.get('cat'));
  if (!cat) { location.replace('learn.html'); return; }
  const peers = data.bones.filter((b) => b.cat === cat.id);
  if (!peers.length) { location.replace('learn.html'); return; }

  $('#catTitle').textContent = cat.name;
  $('#quizLink').href = `quiz.html?scope=${cat.id}&n=6`;

  const nav = $('#boneNav');
  const chips = new Map();
  peers.forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'schip';
    btn.addEventListener('click', () => go(b.id));
    nav.appendChild(btn);
    chips.set(b.id, btn);
  });

  let current = null;
  const imgs = {};

  function refresh() {
    const k = peers.filter((b) => done.has(b.id)).length;
    $('#catChip').textContent = `已学 ${k} / ${peers.length}`;
    setBar($('#catBar'), $('#catBarWrap'), k, peers.length, `${cat.name}学习进度`);
    peers.forEach((b) => {
      const chip = chips.get(b.id);
      const isDone = done.has(b.id);
      chip.classList.toggle('done', isDone);
      chip.classList.toggle('on', current === b);
      chip.textContent = `${isDone ? '✓ ' : ''}${displayName(b.cn)}`;
      if (current === b) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    });
    $('#quizNote').textContent = k === peers.length
      ? `本部位 ${peers.length} 种骨已全部学完，去自测检验一下吧！`
      : '学完本部位后检验一下，答错的题自动收进错题本。';
    if (current) {
      const isDone = done.has(current.id);
      const state = $('#boneState');
      state.textContent = isDone ? '已学' : '未学';
      state.classList.toggle('done', isDone);
      const mark = $('#markBtn');
      mark.textContent = isDone ? '已学 ✓ · 点击取消标记' : '标记已学';
      mark.className = isDone ? 'learn-mark-done' : 'primary';
      mark.setAttribute('aria-pressed', String(isDone));
    }
  }

  function render(bone) {
    current = bone;
    document.title = `${displayName(bone.cn)} · ${cat.name} · 识骨学习`;
    $('#boneTitle').textContent = displayName(bone.cn);
    $('#boneEn').textContent = bone.en;
    $('#boneIntro').textContent = bone.intro;
    const list = $('#bonePoints');
    list.textContent = '';
    bone.points.forEach((pt) => {
      const li = document.createElement('li');
      li.textContent = pt;
      list.appendChild(li);
    });

    const panel = $('#vpImg');
    panel.textContent = '';
    for (const v of ['front', 'side', 'back']) {
      const img = document.createElement('img');
      img.src = `assets/${bone.views[v]}?v=${data.ver}`;
      img.alt = `${displayName(bone.cn)}${VIEW_NAMES[v]}观`;
      if (v === 'front') img.className = 'on';
      panel.appendChild(img);
      imgs[v] = img;
    }
    document.querySelectorAll('#viewTabs button').forEach((b) => {
      const on = b.dataset.v === 'front';
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });

    const i = peers.indexOf(bone);
    const prev = peers[(i - 1 + peers.length) % peers.length];
    const next = peers[(i + 1) % peers.length];
    const pl = $('#prevBone');
    const nl = $('#nextBone');
    pl.href = `learn-path.html?cat=${cat.id}&bone=${prev.id}`;
    pl.textContent = `← ${displayName(prev.cn)}`;
    nl.href = `learn-path.html?cat=${cat.id}&bone=${next.id}`;
    nl.textContent = `${displayName(next.cn)} →`;

    history.replaceState(null, '', `learn-path.html?cat=${cat.id}&bone=${bone.id}`);
    refresh();
  }

  function go(id) {
    const bone = peers.find((b) => b.id === id);
    if (!bone || bone === current) return;
    render(bone);
    window.scrollTo(0, 0);
  }

  $('#viewTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-v]');
    if (!btn) return;
    for (const v of Object.keys(imgs)) imgs[v].classList.toggle('on', v === btn.dataset.v);
    document.querySelectorAll('#viewTabs button').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });

  $('#markBtn').addEventListener('click', () => {
    if (!current) return;
    if (done.has(current.id)) done.delete(current.id);
    else done.add(current.id);
    saveDone();
    refresh();
  });

  for (const el of [$('#prevBone'), $('#nextBone')]) {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      go(new URLSearchParams(el.search).get('bone'));
    });
  }

  const wanted = peers.find((b) => b.id === p.get('bone'));
  const firstNew = peers.find((b) => !done.has(b.id));
  render(wanted || firstNew || peers[0]);
}
