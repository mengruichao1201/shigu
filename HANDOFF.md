# 「识骨」学习模块交接文档

> 交付人：孟睿超（山东中医药大学，负责编程 / 交互 / 部署）
> 接收人：队友（西交利物浦大学，负责学习模块制作 + 内容审核 + 标本照片）
> 日期：2026-11-20 · 线上站点：https://bone-id-trainer-2jxa6z764zs.qoder.zone

---

## 1. 现状与分工

站点已有两个模块上线（公开可访问）：

| 模块 | 页面 | 状态 |
| --- | --- | --- |
| 练习 | `practice.html`（设置）→ `quiz.html`（答题） | v3 已发布：218 题，点图 / 选择 / 判断三题型，错题本闭环 |
| 知识库 | `kb.html`（骨架 hover 高光）→ `kb-cat.html`（分区）→ `kb-bone.html`（骨条目三视角） | 已发布：53 种骨 × 3 视角 |
| **学习** | 门户灰卡「即将上线」 | **本文档交付给你制作** |

分工边界：**你制作学习模块并审核内容；孟睿超负责集成、全站联调与发布。** 发布只走孟睿超的 Qoder 账号（站点已绑定），你不要在自己的账号上执行发布操作，否则会裂成两个站点。

## 2. 快速开始

```bash
cd bone-quiz
py tools/serve.py        # 注意：本机 python 命令损坏，一律用 py
# 浏览器打开 http://127.0.0.1:8765
```

- 纯静态 HTML/CSS/JS，**无构建步骤、无框架、无 npm 依赖**，改完刷新即见。
- 本地服务器已设 no-store，不受缓存干扰；线上资源靠 `?v=N` 版本号防缓存（见 §4.5）。
- 骨图渲染管线在 `bone-library/tools/`（Blender 无头脚本），复现方法见 `bone-library/README.md`。**你不需要渲染任何新图**——53 种骨三视角 webp 已在 `bone-quiz/assets/bones/`。原始模型包 `_source/`（171MB）与 PNG 原图（155MB）不在本包内，需要时单独找孟睿超传。

## 3. 目录结构

```
bone-quiz/
├── index.html          门户首页（三模块卡）
├── practice.html       练习设置页（范围/题型/题数）
├── quiz.html           答题页（点图掩膜判定/选择/判断）
├── kb.html / kb-cat.html / kb-bone.html   知识库三级页
├── styles.css          全站样式（CSS 变量主题，当前 v=6）
├── app.js / setup.js / kb.js / home.js    各页脚本
├── assets/
│   ├── bones.json      骨库事实数据（53 条）★内容核心
│   ├── questions.json  题库（218 题，生成物，勿手改）
│   ├── bones/          159 张骨图 webp + 4 分区图层 + 整骨架合成图 + 16 张点选掩膜
│   └── bg.webp         首页背景（公版图谱）
└── tools/
    ├── gen-questions.mjs   题库生成器（node tools/gen-questions.mjs，固定种子可复现）
    ├── export-review.mjs   导出待审核题 CSV
    └── serve.py            本地预览服务器（端口 8765）
bone-library/           骨图库管线（tools/ + catalog.json + manifest.json + README.md）
handoff/待审核题清单.csv  122 道待审核题（本包根目录也有一份）
```

## 4. 数据契约（改动前必读）

### 4.1 bones.json（骨库事实，可编辑内容）

```jsonc
{
  "ver": "2026-11-20T15:05:17",   // 内容版本号，改内容后更新，页面用它做 ?v=
  "cats": [ { "id": "skull", "name": "颅骨", "pieces": "23 块", "blurb": "…" } ],
  "bones": [ {
    "id": "femur",                 // 英文 slug，全站唯一键，勿改
    "cn": "股骨",                  // 中文名；代表块用下划线： "寰椎_C1"，显示时替换为 " · "
    "en": "femur",
    "cat": "skull|trunk|upper|lower",
    "views": { "front": "bones/lower/femur_front.webp", "side": "…", "back": "…" },
    "intro": "一句话简介",
    "points": ["要点1", "要点2", "要点3"]   // 2–3 条，题库自动生成直接引用
  } ]
}
```

**改 intro/points 会影响自动生成的题目**，改完必须重跑 `node tools/gen-questions.mjs` 并重新导出审核清单。新增字段（如学习笔记 `learn`）可以加，**现有字段名与 id 不可改**。

### 4.2 questions.json（题库，生成物）

顶层：`{ ver, frame:{w:800,h:2108}, body:"bones/body_composite.webp", scopes, questions }`。
`scopes`：`limbs`（父）+ `upper / lower / skull / trunk`（均 open:true）。

三种题型字段：

| kind | 特有字段 | 说明 |
| --- | --- | --- |
| `img` 点图 | `target, name, mask, label, hint, explain` | 在整骨架合成图上点选；mask 为 `bones/masks/{target}.webp` 半分辨率 alpha 掩膜 |
| `mcq` 选择 | `img?(骨图路径), stem, options[4], answer(正确项下标), hint?, explain` | `img` 缺省为纯文字题 |
| `tf` 判断 | `statement, answer(true/false), hint?, explain` | |

公共字段：`id`（唯一）、`kind`、`scope`、`reviewed`（**true=已核对，false=待你审核**）、`bone?`（关联骨 id，用于知识库深链）。

**不要手改 questions.json**——改 `gen-questions.mjs` 里的内容数组（CLASSIC_MCQ / CLASSIC_TF / FOREARM_*）或 bones.json 后重新生成。审核通过的题把生成器里对应 `reviewed:false` 改 true。

### 4.3 localStorage 键（本机浏览器保存，勿改名）

| 键 | 内容 |
| --- | --- |
| `bonequiz.wrong.v1` | 错题 id 数组；答对自动移出 |
| `bonequiz.history.v1` | 答题记录 `{id,scope,kind,ok,t}`，上限 500 条 |
| `bonequiz.prefs.v1` | 练习设置 `{scopes,kinds,n}` |
| `bonequiz.learn.v1` | 学习进度 `{done:[骨id…], t:时间戳}`，按 id 去重；learn.html / learn-path.html 读写 |

学习模块进度键 `bonequiz.learn.v1` 已启用，结构见上表与 §5。

### 4.4 URL 参数约定

- `kb-cat.html?cat=skull|trunk|upper|lower`
- `kb-bone.html?bone={骨id}`
- `quiz.html?scope=upper,lower&kind=img,mcq,tf&n=6|10|12&mode=retry`
- 学习模块建议：`learn.html?cat=…`，学完自测跳 `quiz.html?scope={cat}&n=6`

### 4.5 缓存版本号规则

- HTML 引用 css/js 一律带 `?v=N`：**改了哪个文件就把对应版本号 +1**（当前 styles v=6 / app v=4 / setup v=2 / kb v=2 / home v=4 / learn css·js v=1）。
- 骨图 src 带 `?v={bones.json.ver}`；题库 fetch 用 `cache:'no-store'`。

## 5. 学习模块范围（建议方案，可调整）

**定位**：知识库是「查阅」，练习是「考核」，学习是「按路径走完一个部位」——结构化课程 + 进度 + 学后自测。

最小完整实现（全部复用现有素材，零新图）：

1. **`learn.html` 学习首页**：四部位路径卡（颅骨 15 种 / 躯干 9 / 上肢 15 / 下肢 14），每卡显示「已学 x / n」进度条；数据读 bones.json + `bonequiz.learn.v1`。
2. **`learn-path.html?cat=…` 路径页**：该部位骨列表（复用 kb-cat 的骨卡样式），每块骨一个学习单元：三视角图 + intro + points（直接复用 `kb-bone.html` 亦可，加「标记已学」按钮）；可选加你写的记忆口诀 / 学习提示（bones.json 新增 `learn` 字段）。
3. **学后自测**：路径页底部「本部位自测」→ `quiz.html?scope={cat}&n=6`；答完回到学习页可见进度。
4. **进度键（已实现）**：`bonequiz.learn.v1 = { done: ["femur", …], t: 时间戳 }`，见 §4.3。
5. **门户集成（已完成）**：index.html 学习卡已改活链接 learn.html，home.js 显示「已学 x / 53」进度。

> 2026-11-22 学习模块已实现：`learn.html`、`learn-path.html?cat=…&bone=…`、`learn.js`、`learn.css`。样式独立成 learn.css（复用 styles.css 变量与组件类，未改 styles.css 与任何现有页面）；路径页为逐块学习流（三视角 + 简介 + 要点 + 标记已学 + 上/下一块 + 本部位自测）。门户学习卡接入待孟睿超集成。

样式要求：复用 `styles.css` 的 CSS 变量与现有组件类（`.card / .bone-card / .back / .chip` 等），暖纸色 + 朱红 + 黛蓝的医学图谱气质，**不引第二套 UI 框架**。移动端 390px 宽必须可用。

## 6. 你的内容任务

### 6.1 审核 122 道题（优先级最高）

`待审核题清单.csv`（UTF-8 BOM，Excel/WPS 直接打开）：53 道特征选择 + 53 道判断 + 16 道前臂专题。逐条对照人卫版《系统解剖学》核对：

- 「审核结论」填 **通过 / 修改 / 删除**；「修改意见」写具体改法（改题干 / 改选项 / 改答案 / 改解析）。
- 填完回传 CSV，孟睿超改生成器并重新生成题库。
- 判断依据：bones.json 的 points 本身也要顺带核对——它们是自动题的题源。

### 6.2 标本照片（替换渲染图，时间允许再做）

- 每块骨拍 **前面 / 侧面（外侧）/ 后面** 三张，解剖学上方朝画面正上，成对骨取**右侧**。
- 统一浅色纯背景、自然光或柔光、无阴影遮挡特征；骨占画面约 70%。
- 命名 `{骨id}_{front|side|back}.jpg`（如 `femur_front.jpg`），按部位分文件夹打包回传；格式转换与入库由孟睿超处理。
- 照片须为**自己拍摄或已获授权**，来源写清楚（实验室 / 课程标本等），用于论坛帖与页脚署名。

### 6.3 可选加分项

每块骨一句记忆口诀或临床联系（如「舟月三角豆，大小头状钩」），写入 bones.json 新增 `learn` 字段，学习模块展示。

## 7. 制作红线

1. **只加不改**：新增 learn 页面与脚本；不动练习 / 知识库的 JSON 字段名、localStorage 键、URL 参数、现有页面行为。确需改现有文件，先在群里说一声。
2. **署名不能丢**：凡用骨图的页面保留页脚——
   > 骨图渲染自 BodyParts3D, © The Database Center for Life Science（CC BY-SA 2.1 JP，骨图同许可共享）
   > 尾骨图版：Gray's Anatomy（1918，公有领域） · 仅供解剖学学习使用，不构成诊疗建议
   新素材必须版权清楚：自拍标本照可以，**网图不能随便拿**（BodyParts3D 衍生图须同许可共享）。
3. **内容口径**：教学性表述，不下诊断结论；以人卫版《系统解剖学》为准；拿不准的标出来讨论。
4. **技术边界**：纯静态 HTML/CSS/JS，不引框架 / 构建工具 / CDN 依赖；改资源 bump `?v=`。
5. **测试底线**：桌面 + 390px 移动端各过一遍主流程，浏览器控制台无报错；键盘可操作（Tab 焦点可见）。
6. **留痕**：你的 Qoder 对话、修改、预览过程**随手截图**——天池论坛作品帖要展示两人各自的 Qoder 使用过程，并声明两人的 Qoder 账号。

## 8. 协作与发布流程

- 代码仓库：**GitHub** <https://github.com/mengruichao1201/shigu>（公开，已含全部源码与本文档）。首次 `git clone https://github.com/mengruichao1201/shigu.git`；日常 `git pull` → 改动 → `git commit` → `git push`，提交信息写清「做了什么」。大文件（照片原图、模型包）不进仓库，微信 / 网盘传。
- 网络备注：个别网络下 `github.com:443` 的 TLS 会被重置（clone/push 失败）而 `api.github.com` 正常。仓库根 `tools/github-api-push.py` 可经官方 API 完成推送（`py tools/github-api-push.py`，凭据走 git credential，不落盘）；或开代理后 `git -c http.proxy=http://127.0.0.1:7897 push`（端口按本机代理改）。
- 发布：只有孟睿超账号执行（Qoder Sites 已绑定 projectId）。你本地 `py tools/serve.py` 自测，push 后由他集成发布，发布后群里通知。
- 共享记忆：仓库根 `HANDOFF.md`（本文档）+ 后续可加 `PROGRESS.md` / `DECISIONS.md`，两边 Qoder 开工先读、收工更新。
- 页脚署名：把你的真名发孟睿超，替换「队友署名待补（西交利物浦大学）」。

## 9. 赛务与时间点

| 节点 | 日期 |
| --- | --- |
| **内容冻结**（审核 CSV 回传 + 学习模块功能完成） | **2026-11-26** |
| 集成联调 + 论坛帖撰写 | 11-27 |
| 自定提交日 | 11-28 |
| **大赛硬截止**（报名 + 组队 + 作品提交） | **2026-11-30 18:00 北京时间** |

交付物 = 公开站点链接 + 天池赛题论坛作品帖（解决什么问题、怎么用、两人分工、如何用 Qoder 做出，附过程截图）。
请尽快确认：你的报名状态、入队、Qoder 账号（论坛帖要声明）、真名。

## 10. 已知环境坑（Qoder 内置浏览器 / 本机）

- 本机 `python` 命令损坏（exit 49），一律用 `py`；中文输出设 `PYTHONIOENCODING=utf-8`。
- Qoder 内置浏览器面板隐藏时：截图会失败（用 take_snapshot / evaluate_script 代替）；`img.decode()` 的 Promise 永不 settle，图片就绪判定用 `complete` + `load/error` 事件。
- 脚本顶层 `const state` 不挂在 window 上，自动化测试要走 DOM。
- 每次改完 js 先 `node --check 文件` 再刷新页面测试，避免语法错误被缓存掩盖。
- 移动端视口测试：同页嵌 390×844 iframe 可触发真实媒体查询。
