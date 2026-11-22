(async () => {
  const meta = document.getElementById('practiceMeta');
  let wrongCount = 0;
  try {
    const wrong = JSON.parse(localStorage.getItem('bonequiz.wrong.v1') || '[]');
    if (Array.isArray(wrong)) wrongCount = wrong.length;
  } catch { }
  try {
    const res = await fetch('assets/questions.json', { cache: 'no-store' });
    const data = await res.json();
    const n = data.questions.length;
    meta.textContent = wrongCount > 0
      ? `${n} 题已开放 · 待复习错题 ${wrongCount} 道`
      : `${n} 题已开放 · 三种题型混练`;
  } catch {
    if (wrongCount > 0) meta.textContent = `待复习错题 ${wrongCount} 道`;
  }
})();

(async () => {
  const meta = document.getElementById('learnMeta');
  let done = [];
  try {
    const v = JSON.parse(localStorage.getItem('bonequiz.learn.v1'));
    if (Array.isArray(v && v.done)) done = v.done.filter((id) => typeof id === 'string');
  } catch { }
  try {
    const res = await fetch('assets/bones.json', { cache: 'no-store' });
    const data = await res.json();
    const total = data.bones.length;
    const learned = data.bones.filter((b) => done.includes(b.id)).length;
    meta.textContent = learned > 0
      ? `已学 ${learned} / ${total} 种 · 继续学习`
      : `四条路径 · ${total} 种骨 · 学后自测`;
  } catch {
    if (done.length > 0) meta.textContent = `已学 ${done.length} 种 · 继续学习`;
  }
})();