import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');
const bones = JSON.parse(readFileSync(join(assets, 'bones.json'), 'utf8')).bones;
const byId = Object.fromEntries(bones.map(b => [b.id, b]));

// 固定种子：选项顺序可复现，便于队友审核与回归测试
let seed = 20261120;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffle = a => {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};
const pick = (arr, n, not) => shuffle(arr.filter(x => x !== not)).slice(0, n);

const display = b => b.cn.replace(/_/g, ' · ');
const sameCat = b => bones.filter(x => x.cat === b.cat && x.id !== b.id);
const explainOf = b => `${display(b)}：${b.intro}${b.points.join('；')}。`;

const SCOPES = [
  { id: 'limbs', name: '四肢骨', parent: null },
  { id: 'upper', name: '上肢骨', parent: 'limbs', open: true },
  { id: 'lower', name: '下肢骨', parent: 'limbs', open: true },
  { id: 'skull', name: '颅骨', parent: null, open: true },
  { id: 'trunk', name: '躯干骨', parent: null, open: true },
];

const MASK_TARGETS = ['frontal_bone', 'mandible', 'sternum', 'rib', 'lumbar_vertebra', 'sacrum',
  'clavicle', 'scapula', 'humerus', 'radius', 'ulna',
  'hip_bone', 'femur', 'patella', 'tibia', 'fibula'];
const IMG_HINT = {
  rib: '胸廓两侧成对的弓形扁骨，后端接胸椎，前端借肋软骨连向胸骨。',
  lumbar_vertebra: '脊柱腰段粗壮的椎骨，共 5 块，棘突宽短呈板状、水平后伸。',
  sacrum: '脊柱下端由 5 块椎骨融合成的三角形骨，夹于两侧髋骨之间。',
};

const out = [];

for (const t of MASK_TARGETS) {
  const b = byId[t];
  out.push({
    id: `i_${t}`, kind: 'img', scope: b.cat, reviewed: true, bone: t,
    target: t, name: b.cn.split('_')[0], label: '人体骨架 · 前面观',
    mask: `bones/masks/${t}.webp`,
    hint: IMG_HINT[t] || b.intro,
    explain: explainOf(b),
  });
}

for (const b of bones) {
  const opts = shuffle([display(b), ...pick(sameCat(b), 3).map(display)]);
  out.push({
    id: `mi_${b.id}`, kind: 'mcq', scope: b.cat, reviewed: true, bone: b.id,
    img: b.views.front, stem: '图中所示的骨是？',
    options: opts, answer: opts.indexOf(display(b)),
    hint: b.intro, explain: explainOf(b),
  });
}

bones.forEach((b, i) => {
  const own = b.points[i % b.points.length];
  const foreign = pick(sameCat(b), 3).map(o => o.points[(i + 1) % o.points.length]);
  const negative = i % 2 === 1;
  const opts = shuffle(negative ? [own, ...foreign] : [own, ...foreign]);
  const answer = negative ? opts.findIndex(o => o !== own) : opts.indexOf(own);
  out.push({
    id: `mt_${b.id}`, kind: 'mcq', scope: b.cat, reviewed: false, bone: b.id,
    stem: negative ? `下列哪项不属于${display(b)}的特征？` : `下列哪项是${display(b)}的特征？`,
    options: opts, answer,
    hint: b.intro, explain: explainOf(b),
  });
});

bones.forEach((b, i) => {
  const truth = i % 2 === 0;
  const other = pick(sameCat(b), 1)[0];
  const point = truth ? b.points[i % b.points.length] : other.points[(i + 1) % other.points.length];
  out.push({
    id: `tf_${b.id}`, kind: 'tf', scope: b.cat, reviewed: false, bone: b.id,
    statement: `「${point}」描述的是${display(b)}。`,
    answer: truth,
    hint: b.intro,
    explain: truth
      ? explainOf(b)
      : `该特征属于${display(other)}（${other.intro}）。${display(b)}的特征是：${b.points.join('；')}。`,
  });
});

// 经典骨学考点（教材通行结论，联网核对过口诀与数目）
const CLASSIC_MCQ = [
  ['upper', '腕骨近侧列从桡侧到尺侧依次为？', ['舟骨、月骨、三角骨、豌豆骨', '舟骨、三角骨、月骨、豌豆骨', '月骨、舟骨、豌豆骨、三角骨', '大多角骨、小多角骨、头状骨、钩骨'], 0, '口诀「舟月三角豆」即近侧列从桡侧到尺侧：手舟骨、月骨、三角骨、豌豆骨；远侧列为「大小头状钩」。'],
  ['upper', '腕骨远侧列从桡侧到尺侧依次为？', ['大多角骨、小多角骨、头状骨、钩骨', '头状骨、钩骨、大多角骨、小多角骨', '小多角骨、大多角骨、钩骨、头状骨', '舟骨、月骨、三角骨、豌豆骨'], 0, '口诀「大小头状钩」即远侧列从桡侧到尺侧：大多角骨、小多角骨、头状骨、钩骨。'],
  ['lower', '跗骨共 7 块，下列哪块不属于跗骨？', ['足舟骨', '骰骨', '豌豆骨', '距骨'], 2, '豌豆骨属于腕骨；跗骨 7 块为距骨、跟骨、足舟骨、骰骨与三块楔骨（口诀「上距下跟舟外骰，楔一楔二楔外三」）。'],
  ['trunk', '颈椎、胸椎、腰椎合计共多少块？', ['24 块', '26 块', '33 块', '12 块'], 0, '颈 7、胸 12、腰 5 共 24 块可动椎；加上骶骨、尾骨各 1 块才是 26 块椎骨。'],
  ['trunk', '胸骨角两侧平对？', ['第 2 肋', '第 1 肋', '第 3 肋', '第 7 颈椎棘突'], 0, '胸骨柄与胸骨体连接处微向前突称胸骨角，两侧平对第 2 肋，是计数肋序的标志。'],
  ['trunk', '计数肋序最常用的体表标志是？', ['胸骨角', '剑突', '颈静脉切迹', '肋弓最低点'], 0, '胸骨角平对第 2 肋，由此向下可逐一计数肋骨与肋间隙。'],
  ['skull', '脑颅骨共几块？', ['8 块', '15 块', '23 块', '6 块'], 0, '脑颅 8 块：额、枕、蝶、筛各 1，顶、颞各 2；面颅 15 块，合计 23 块（不含听小骨）。'],
  ['skull', '面颅骨共几块？', ['15 块', '8 块', '23 块', '14 块'], 0, '面颅 15 块：成对的上颌骨、腭骨、骨、鼻骨、泪骨、下鼻甲，不成对的犁骨、下颌骨、舌骨。'],
  ['skull', '下列哪组脑颅骨是成对的？', ['顶骨与颞骨', '额骨与枕骨', '蝶骨与筛骨', '额骨与蝶骨'], 0, '脑颅中只有顶骨、颞骨成对；额、枕、蝶、筛均为单块。'],
  ['skull', '下列哪组面颅骨是不成对的？', ['犁骨、下颌骨、舌骨', '上颌骨、鼻骨', '颧骨、泪骨', '腭骨、下鼻甲'], 0, '面颅不成对者为犁骨、下颌骨、舌骨（口诀「梨下舌」）；其余面颅骨均成对。'],
  ['trunk', '成人终生保留红骨髓的骨不包括？', ['椎骨', '胸骨', '髂骨', '股骨骨干'], 3, '口诀「警察追凶，又掐又勒」谐音椎骨、胸骨、髂骨、肋骨终生含红骨髓；长骨骨干成年后为黄骨髓。'],
  ['lower', '两侧髂嵴最高点的连线平对？', ['第 4 腰椎棘突', '第 2 腰椎棘突', '第 5 腰椎棘突', '第 12 胸椎棘突'], 0, '髂嵴最高点连线约平第 4 腰椎棘突，是腰椎穿刺定位的体表标志。'],
  ['upper', '跌倒时手掌撑地，随后「鼻烟窝」压痛，最易骨折的腕骨是？', ['手舟骨', '月骨', '豌豆骨', '钩骨'], 0, '手舟骨腰部血供差，掌撑地暴力易致其骨折，鼻烟窝压痛是典型体征，且易延迟愈合。'],
  ['trunk', '第 8–10 肋前端借肋软骨连于上位肋软骨，这类肋称为？', ['假肋', '真肋', '浮肋', '颈肋'], 0, '1–7 真肋直连胸骨；8–10 假肋连于上位肋软骨形成肋弓；11–12 浮肋前端游离。'],
];
const CLASSIC_TF = [
  ['upper', '腕骨共 8 块，排成近、远两列。', true, '腕骨 8 块：近侧列舟、月、三角、豌豆，远侧列大、小多角、头、钩。'],
  ['upper', '拇指有 3 节指骨。', false, '拇指只有 2 节指骨（近节、远节），其余各指 3 节；每手共 14 块指骨。'],
  ['upper', '每手共有 14 块指骨。', true, '拇指 2 节 + 其余四指各 3 节 = 14 块；足趾 likewise 每足 14 块。'],
  ['lower', '髌骨是人体最大的籽骨。', true, '髌骨包于股四头肌腱内，是人体最大的籽骨，保护膝关节并增大伸膝力臂。'],
  ['skull', '舌骨不与任何骨直接相关节。', true, '舌骨借肌和韧带悬于颞骨茎突，是全身唯一不与其他骨直接相连的骨。'],
  ['trunk', '所有颈椎都有椎体。', false, '寰椎（C1）无椎体与棘突，呈环形；齿突原属寰椎椎体，发育中并入枢椎。'],
  ['trunk', '胸椎棘突长，呈叠瓦状斜向后下。', true, '胸椎棘突细长、斜向后下呈叠瓦状，与颈椎短分叉、腰椎板状水平棘突相区别。'],
  ['trunk', '第 11、12 肋前端游离，称浮肋。', true, '浮肋前端游离于腹壁肌中；真肋 1–7 直连胸骨，假肋 8–10 连上位肋软骨。'],
  ['upper', '锁骨中、外 1/3 交界处最易骨折。', true, '锁骨呈 S 形，中外交界处为形态与受力转折點，跌倒撑地时最易骨折。'],
  ['lower', '腓骨下端膨大构成内踝。', false, '腓骨下端构成外踝；内踝由胫骨下端构成。'],
  ['lower', '胫骨粗隆有髌韧带附着。', true, '髌韧带止于胫骨粗隆，是膝跳反射的叩击定位标志。'],
  ['trunk', '骶骨由 5 块骶椎融合而成。', true, '5 块骶椎融合为三角形骶骨，岬为产科测量标志，耳状面与髋骨构成骶髂关节。'],
  ['skull', '颅骨共 23 块，不包括中耳内的听小骨。', true, '脑颅 8 + 面颅 15 = 23 块；6 块听小骨单独计数。'],
];
CLASSIC_MCQ.forEach(([scope, stem, options, answer, explain], i) => {
  out.push({ id: `cm${i + 1}`, kind: 'mcq', scope, reviewed: true, stem, options, answer, explain });
});
CLASSIC_TF.forEach(([scope, statement, answer, explain], i) => {
  out.push({ id: `ct${i + 1}`, kind: 'tf', scope, reviewed: true, statement, answer, explain });
});

// 前臂专题旧题（事实库口径，保留待队友审核）
const FOREARM_MCQ = [
  ['解剖学姿势（手掌向前）下，位于前臂外侧、拇指一侧的骨是？', ['桡骨', '尺骨', '肱骨', '锁骨'], 0, '解剖位口诀“桡外尺内”：拇指侧是桡骨，小指侧是尺骨。肱骨在上臂，锁骨在肩前，都不在前臂。'],
  ['上端呈圆盘状、与肱骨小头相关节的前臂骨是？', ['尺骨', '桡骨', '肩胛骨', '手舟骨'], 1, '圆盘状的桡骨头是桡骨的标志性特征，它与肱骨小头相关节；尺骨上端粗大，靠滑车切迹“咬”住肱骨滑车。'],
  ['上端有鹰嘴、屈肘时在肘后皮下最易摸到的骨是？', ['桡骨', '肱骨', '尺骨', '锁骨'], 2, '鹰嘴属于尺骨上端，屈肘时它就是肘后最突出的骨性标志；摸到鹰嘴，就找到了尺骨。'],
  ['前臂做旋前、旋后运动时，桡骨围绕哪块骨旋转？', ['肱骨', '尺骨', '桡骨自身', '手舟骨'], 1, '前臂旋转以尺骨为轴：尺骨基本不动，桡骨头原地自转、远端带着手绕尺骨交叉过去，旋前时两骨呈交叉状。'],
  ['下端膨大、直接参与桡腕关节构成的前臂骨是？', ['桡骨', '尺骨', '肱骨', '大多角骨'], 0, '桡骨下端膨大，其腕关节面直接与近排腕骨构成桡腕关节；尺骨下端细小，借关节盘隔开，不直接参与。'],
  ['尺骨上端与肱骨滑车相关节的结构是？', ['桡切迹', '滑车切迹', '桡骨头凹', '尺切迹'], 1, '尺骨上端的滑车切迹像扳手口一样包住肱骨滑车，构成肘关节的肱尺部分；桡切迹在滑车切迹外侧，与桡骨头相关节。'],
  ['关于前臂两骨两端粗细的描述，正确的是？', ['桡骨上端粗大、下端细小', '尺骨上端粗大、下端细小', '两骨下端都膨大', '两骨上端都是圆盘状'], 1, '尺骨上端粗大（鹰嘴+滑车切迹）、下端细小（尺骨头）；桡骨相反，上端是圆盘状小头、下端膨大。认两端粗细是最可靠的鉴别法。'],
  ['前臂旋前（手背转向前）时，桡骨与尺骨的位置关系是？', ['两骨平行排列', '两骨交叉，桡骨转到尺骨前方', '两骨交叉，尺骨转到桡骨前方', '两骨完全重叠'], 1, '旋前时桡骨绕尺骨旋转，远端带着手转到尺骨前方，两骨呈交叉状；尺骨作为旋转轴基本不动。'],
];
const FOREARM_TF = [
  ['解剖学姿势下，桡骨位于前臂内侧（小指一侧）。', false, '正好相反：解剖位“桡外尺内”，桡骨在外侧、拇指一侧，尺骨才在内侧、小指一侧。'],
  ['尺骨上端有鹰嘴，屈肘时可在肘后皮下摸到。', true, '鹰嘴是尺骨上端向后的突起，屈肘时即为肘后最明显的骨性标志，是判断尺骨的可靠依据。'],
  ['桡骨下端细小，不参与腕关节的构成。', false, '桡骨下端膨大，其腕关节面直接参与桡腕关节；下端细小、不直接参与腕关节的是尺骨。'],
  ['前臂旋前时，桡骨与尺骨仍保持平行排列。', false, '旋前时桡骨绕尺骨旋转、两骨交叉；只有旋后（解剖位）时两骨才平行并列。'],
  ['桡骨上端为圆盘状的桡骨头，与肱骨小头相关节。', true, '圆盘状桡骨头是桡骨的标志性形态，上面的关节凹与肱骨小头相关节，参与肘关节构成。'],
  ['前臂的旋前、旋后运动以尺骨为轴，桡骨围绕尺骨旋转。', true, '尺骨是前臂旋转的固定轴，桡骨头在近端自转、远端绕尺骨划弧，带动手完成翻掌动作。'],
  ['从后面观察前臂骨时，两骨的左右位置互换，但两端形态特征不变。', true, '换观察面只改变画面左右，不改变骨本身的形态：上端圆盘头、下端粗大的仍是桡骨。认两端比死记左右可靠。'],
  ['前臂两根骨中，下端粗大的是尺骨。', false, '下端粗大的是桡骨；尺骨下端细小，称尺骨头。“桡骨下粗上细、尺骨上粗下细”是核心鉴别点。'],
];
FOREARM_MCQ.forEach(([stem, options, answer, explain], i) => {
  out.push({ id: `m${i + 1}`, kind: 'mcq', scope: 'upper', reviewed: false, stem, options, answer, explain, bone: i < 4 ? 'radius' : 'ulna' });
});
FOREARM_TF.forEach(([statement, answer, explain], i) => {
  out.push({ id: `t${i + 1}`, kind: 'tf', scope: 'upper', reviewed: false, statement, answer, explain, bone: i % 2 ? 'ulna' : 'radius' });
});

writeFileSync(join(assets, 'questions.json'), JSON.stringify({
  ver: Date.now(), frame: { w: 800, h: 2108 }, body: 'bones/body_composite.webp',
  scopes: SCOPES, questions: out,
}, null, 1));

for (let i = 1; i <= 6; i++) {
  const f = join(assets, `q${i}.svg`);
  if (existsSync(f)) rmSync(f);
}
const legacy = join(root, 'tools', 'gen-assets.mjs');
if (existsSync(legacy)) rmSync(legacy);

const byKind = {};
for (const q of out) byKind[q.kind] = (byKind[q.kind] || 0) + 1;
const byScope = {};
for (const q of out) byScope[q.scope] = (byScope[q.scope] || 0) + 1;
console.log('questions', out.length, byKind, byScope);