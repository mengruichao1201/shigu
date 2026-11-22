(async () => {
  const $ = (s) => document.querySelector(s);
  const PRIORITY = ['skull', 'upper', 'lower', 'trunk'];
  const displayName = (cn) => cn.replace(/_/g, ' · ');
  const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FALLBACK_CATS = {
    skull: { name: '颅骨', pieces: '23 块' },
    trunk: { name: '躯干骨', pieces: '51 块' },
    upper: { name: '上肢骨', pieces: '64 块' },
    lower: { name: '下肢骨', pieces: '62 块' }
  };

  const readArr = (k) => {
    try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; }
    catch { return []; }
  };
  const history = readArr('bonequiz.history.v1');
  const wrong = readArr('bonequiz.wrong.v1');
  let done = [];
  try {
    const v = JSON.parse(localStorage.getItem('bonequiz.learn.v1'));
    if (Array.isArray(v && v.done)) done = v.done.filter((id) => typeof id === 'string');
  } catch { }

  function countUp(el, target, fmt) {
    if (!motionOK || target === 0) { el.textContent = fmt(target); return; }
    const t0 = performance.now();
    const dur = 750;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * e));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const total = history.length;
  const okCount = history.filter((h) => h && h.ok).length;
  countUp($('#stTotal'), total, (v) => String(v));
  if (total > 0) countUp($('#stAcc'), Math.round((okCount / total) * 100), (v) => `${v}%`);
  countUp($('#stWrong'), wrong.length, (v) => String(v));

  let data = null;
  try {
    const res = await fetch('assets/bones.json', { cache: 'no-store' });
    data = await res.json();
  } catch { }

  const learnMeta = $('#learnMeta');
  if (data) {
    const totalBones = data.bones.length;
    const learned = data.bones.filter((b) => done.includes(b.id)).length;
    countUp($('#stLearn'), learned, (v) => `${v} / ${totalBones}`);
    learnMeta.textContent = learned > 0
      ? `已学 ${learned} / ${totalBones} 种 · 继续学习`
      : `四条路径 · ${totalBones} 种骨 · 学后自测`;
    const kinds = {};
    data.bones.forEach((b) => { kinds[b.cat] = (kinds[b.cat] || 0) + 1; });
    document.querySelectorAll('.hm-region').forEach((a) => {
      const c = data.cats.find((x) => x.id === a.dataset.g);
      if (c) a.querySelector('small').textContent = `${c.pieces} · ${kinds[c.id] || 0} 种`;
    });
    initToday(data);
  } else {
    $('#stLearn').textContent = String(done.length);
    if (done.length > 0) learnMeta.textContent = `已学 ${done.length} 种 · 继续学习`;
    $('#todayName').textContent = '加载失败';
    $('#todayIntro').textContent = '骨库数据未能加载，请刷新页面重试。';
  }

  const practiceMeta = $('#practiceMeta');
  try {
    const res = await fetch('assets/questions.json', { cache: 'no-store' });
    const q = await res.json();
    practiceMeta.textContent = wrong.length > 0
      ? `${q.questions.length} 题已开放 · 待复习错题 ${wrong.length} 道`
      : `${q.questions.length} 题已开放 · 三种题型混练`;
  } catch {
    if (wrong.length > 0) practiceMeta.textContent = `待复习错题 ${wrong.length} 道`;
  }

  function initToday(data) {
    const d = new Date();
    $('#todayDate').textContent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let idx = h % data.bones.length;
    renderToday(data, idx);
    $('#shuffleBtn').addEventListener('click', () => {
      if (data.bones.length < 2) return;
      let n = idx;
      while (n === idx) n = Math.floor(Math.random() * data.bones.length);
      idx = n;
      renderToday(data, idx, true);
    });
  }

  function renderToday(data, idx, swap) {
    const b = data.bones[idx];
    const cat = data.cats.find((c) => c.id === b.cat);
    const img = $('#todayImg');
    img.src = `assets/${b.views.front}?v=${data.ver}`;
    img.alt = `${displayName(b.cn)}前面观渲染图`;
    $('#todayNo').textContent = `SPECIMEN NO. ${String(idx + 1).padStart(2, '0')}`;
    $('#todayName').textContent = displayName(b.cn);
    $('#todayEn').textContent = b.en;
    $('#todayCat').textContent = cat ? cat.name : '';
    $('#todayIntro').textContent = b.intro;
    const ul = $('#todayPoints');
    ul.textContent = '';
    b.points.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p;
      ul.appendChild(li);
    });
    $('#todayQuiz').href = `quiz.html?scope=${b.cat}&n=6`;
    $('#todayKb').href = `kb-bone.html?bone=${b.id}`;
    if (swap && motionOK) {
      const fig = $('#todayFig');
      fig.classList.remove('swap');
      void fig.offsetWidth;
      fig.classList.add('swap');
    }
  }

  const stage = $('#hmStage');
  const tag = $('#hmTag');
  const cats = data ? Object.fromEntries(data.cats.map((c) => [c.id, c])) : FALLBACK_CATS;
  const masks = {};
  const imgs = [...stage.querySelectorAll('img')];
  // decode() 在部分渲染状态下永不 settle，用 complete/load 判定就绪
  const ready = imgs.map((im) => (im.complete && im.naturalWidth
    ? Promise.resolve()
    : new Promise((res) => {
      im.addEventListener('load', res, { once: true });
      im.addEventListener('error', res, { once: true });
    })));
  Promise.all(ready).then(() => {
    for (const im of imgs) {
      if (!im.naturalWidth) continue;
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
    stage.addEventListener('pointermove', (e) => setHover(hitAt(e.clientX, e.clientY)));
    stage.addEventListener('pointerleave', () => setHover(null));
    stage.addEventListener('click', (e) => {
      const g = hitAt(e.clientX, e.clientY);
      if (g) location.href = `kb-cat.html?cat=${g}`;
    });
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
    document.querySelectorAll('.hm-region').forEach((a) => a.classList.toggle('on', a.dataset.g === g));
  }

  document.querySelectorAll('.hm-region').forEach((a) => {
    a.addEventListener('mouseenter', () => setHover(a.dataset.g));
    a.addEventListener('focus', () => setHover(a.dataset.g));
    a.addEventListener('mouseleave', () => setHover(null));
    a.addEventListener('blur', () => setHover(null));
  });
})();