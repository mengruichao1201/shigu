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