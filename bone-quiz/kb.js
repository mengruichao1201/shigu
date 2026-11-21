const $ = (s) => document.querySelector(s);
const PRIORITY = ['skull', 'upper', 'lower', 'trunk'];
const VIEW_NAMES = { front: '前面', side: '侧面', back: '后面' };
const displayName = (cn) => cn.replace(/_/g, ' · ');

fetch('assets/bones.json', { cache: 'no-store' })
  .then((r) => r.json())
  .then((data) => {
    const page = document.body.dataset.page;
    if (page === 'kb') initHome(data);
    else if (page === 'kb-cat') initCat(data);
    else initBone(data);
  });

function initHome(data) {
  const stage = $('#bodyStage');
  const tag = $('#bodyTag');
  const cats = Object.fromEntries(data.cats.map((c) => [c.id, c]));
  const kinds = {};
  data.bones.forEach((b) => { kinds[b.cat] = (kinds[b.cat] || 0) + 1; });
  document.querySelectorAll('.kb-cat').forEach((a) => {
    const c = cats[a.dataset.g];
    a.querySelector('small').textContent = `${c.pieces} · 收录 ${kinds[c.id]} 种`;
  });

  const masks = {};
  const imgs = [...stage.querySelectorAll('img')];
  // decode() 在部分渲染状态下永不 settle，改用 complete/load 判定就绪
  const ready = imgs.map((im) => (im.complete && im.naturalWidth
    ? Promise.resolve()
    : new Promise((res) => {
      im.addEventListener('load', res, { once: true });
      im.addEventListener('error', res, { once: true });
    })));
  Promise.all(ready).then(() => {
    for (const im of imgs) {
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth;
      cv.height = im.naturalHeight;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(im, 0, 0);
      const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const alpha = new Uint8Array(cv.width * cv.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
      masks[im.dataset.g] = { w: cv.width, h: cv.height, alpha };
    }
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', () => setHover(null));
    stage.addEventListener('click', onClick);
  });

  function hitAt(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    for (const g of PRIORITY) {
      const m = masks[g];
      if (!m) continue;
      const x = Math.floor(((clientX - r.left) / r.width) * m.w);
      const y = Math.floor(((clientY - r.top) / r.height) * m.h);
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      if (m.alpha[y * m.w + x] > 16) return g;
    }
    return null;
  }

  function setHover(g) {
    if (g) {
      stage.dataset.hover = g;
      tag.textContent = `${cats[g].name} · ${cats[g].pieces} · 点击进入`;
    } else {
      delete stage.dataset.hover;
    }
    document.querySelectorAll('.kb-cat').forEach((a) => a.classList.toggle('on', a.dataset.g === g));
  }

  function onMove(e) { setHover(hitAt(e.clientX, e.clientY)); }
  function onClick(e) {
    const g = hitAt(e.clientX, e.clientY);
    if (g) location.href = `kb-cat.html?cat=${g}`;
  }

  document.querySelectorAll('.kb-cat').forEach((a) => {
    a.addEventListener('mouseenter', () => setHover(a.dataset.g));
    a.addEventListener('focus', () => setHover(a.dataset.g));
    a.addEventListener('mouseleave', () => setHover(null));
    a.addEventListener('blur', () => setHover(null));
  });
}

function initCat(data) {
  const id = new URLSearchParams(location.search).get('cat');
  const cat = data.cats.find((c) => c.id === id);
  if (!cat) { location.replace('kb.html'); return; }
  document.title = `${cat.name} · 识骨知识库`;
  $('#catTitle').textContent = cat.name;
  $('#catPieces').textContent = cat.pieces;
  $('#catBlurb').textContent = cat.blurb;
  const grid = $('#boneGrid');
  data.bones.filter((b) => b.cat === id).forEach((b) => {
    const a = document.createElement('a');
    a.className = 'bone-card';
    a.href = `kb-bone.html?bone=${b.id}`;
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const img = document.createElement('img');
    img.src = `assets/${b.views.front}?v=${data.ver}`;
    img.alt = `${displayName(b.cn)}前面观`;
    img.loading = 'lazy';
    thumb.appendChild(img);
    const text = document.createElement('div');
    text.className = 'bc-text';
    const strong = document.createElement('strong');
    strong.textContent = displayName(b.cn);
    const small = document.createElement('small');
    small.textContent = b.en;
    text.append(strong, small);
    a.append(thumb, text);
    grid.appendChild(a);
  });
}

function initBone(data) {
  const id = new URLSearchParams(location.search).get('bone');
  const bone = data.bones.find((b) => b.id === id);
  if (!bone) { location.replace('kb.html'); return; }
  const cat = data.cats.find((c) => c.id === bone.cat);
  document.title = `${displayName(bone.cn)} · 识骨知识库`;
  const back = $('#backCat');
  back.href = `kb-cat.html?cat=${bone.cat}`;
  back.textContent = `← ${cat.name}`;
  $('#boneTitle').textContent = displayName(bone.cn);
  $('#boneCat').textContent = cat.name;
  $('#boneEn').textContent = bone.en;
  $('#boneIntro').textContent = bone.intro;
  const list = $('#bonePoints');
  bone.points.forEach((p) => {
    const li = document.createElement('li');
    li.textContent = p;
    list.appendChild(li);
  });

  const panel = $('#vpImg');
  const imgs = {};
  for (const v of ['front', 'side', 'back']) {
    const img = document.createElement('img');
    img.src = `assets/${bone.views[v]}?v=${data.ver}`;
    img.alt = `${displayName(bone.cn)}${VIEW_NAMES[v]}观`;
    if (v === 'front') img.className = 'on';
    panel.appendChild(img);
    imgs[v] = img;
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

  const peers = data.bones.filter((b) => b.cat === bone.cat);
  const i = peers.indexOf(bone);
  const prev = peers[(i - 1 + peers.length) % peers.length];
  const next = peers[(i + 1) % peers.length];
  const pl = $('#prevBone');
  const nl = $('#nextBone');
  pl.href = `kb-bone.html?bone=${prev.id}`;
  pl.textContent = `← ${displayName(prev.cn)}`;
  nl.href = `kb-bone.html?bone=${next.id}`;
  nl.textContent = `${displayName(next.cn)} →`;
}