# 骨图库 bone-library

人体 53 种骨 × 3 视角（前面 / 侧面 / 后面）= 159 张图，按解剖分类存放，供「识骨」站点的练习题库与知识库使用。

## 目录结构

```
bone-library/
├── 01_颅骨/      15 种 × 3 视图
├── 02_躯干骨/     8 种 × 3 视图 + 尾骨（公版图版补）
├── 03_上肢骨/    15 种 × 3 视图
├── 04_下肢骨/    14 种 × 3 视图
├── catalog.json   骨目录：FMA / BodyParts3D 部件号 / OBJ 文件名映射
├── manifest.json  成品清单：每骨三视图相对路径、网格顶点数、原始尺寸
├── tools/render_bones.py   Blender 无头批量渲染脚本
└── _source/       BodyParts3D 原始 zip、对照表、55 个 OBJ 网格
```

每种骨一个子文件夹（中文名），内含 `{英文slug}_front.png / _side.png / _back.png`，1024×1024。

## 视图与侧别约定

- **front** 前面观、**side** 外侧观、**back** 后面观；解剖学上方朝画面正上。
- 成对骨统一取**右侧**（BodyParts3D 右侧网格）；中线骨取整体。
- 渲染风格统一：Workbench 引擎、studio 光 + cavity、骨色材质、正交相机、米白背景。
- 每块骨独立归一化尺寸（最大边 = 2 单位），故图间**不反映真实大小比例**；真实尺寸见 manifest 的 `dims_mm`。

## 来源与许可

### 1. BodyParts3D / Anatomography（52 种骨，156 张渲染图）

- 来源：BodyParts3D/Anatomography v4.0（99% decimated OBJ），© The Database Center for Life Science
- 许可：**CC BY-SA 2.1 JP**（https://creativecommons.org/licenses/by-sa/2.1/jp/）
- 下载页：https://dbarchive.biosciencedbc.jp/jp/bodyparts3d/download.html
- 署名要求：使用这些渲染图时须注明
  > BodyParts3D, © The Database Center for Life Science (CC BY-SA 2.1 JP)
  且衍生作品须以相同许可共享。
- 网格为 99% 减面版本，小骨（腕骨、跗骨等）表面可见低模棱面，形态特征仍清晰。
- 胸骨由胸骨柄 / 胸骨体 / 剑突三个部件网格拼接渲染；舌骨由两侧部件拼接。

### 2. Gray's Anatomy 1918（尾骨，3 张裁切图）

- BodyParts3D 无尾骨部件，改用公有领域图版补齐。
- 来源：Gray's Anatomy (1918)，公有领域；书扫页来自 Wikimedia Commons
  `File:Anatomy of the Human Body (Part 1).djvu`（book pp. 109–110，Fig. 97 / Fig. 100）。
- 裁切：前面 / 后面观取自 Fig. 100 上下两幅；侧面观取自 Fig. 97 的尾骨段（含骶尾角标注）。
- 原始书扫页保留在 `02_躯干骨/尾骨/_src/gray_page109.jpg / gray_page110.jpg`。
- 图版为线条图带英文标注，与渲染图风格不同，入库时已单独注明来源。

## 复现渲染

```bash
"<blender.exe>" --background --python tools/render_bones.py
```

- 验证环境：Blender 5.2.3 LTS，Windows，无头（`--background`），Workbench 引擎约 0.1 s/张。
- 脚本读取 `catalog.json`，逐骨导入 OBJ → 绕 X −90°（数据 +Y 朝下）→ 归一化居中 → 三视角正交渲染 → 重写 `manifest.json`。
- 坐标朝向已用股骨（头朝内上）、肩胛骨（前面为光滑肩胛下窝）、额骨、髋骨外侧面人工核对。

## 已知限制

- 渲染图为模式图风格，非真实标本照片；标本照片到位后应逐步替换并重描点图热区。
- 尾骨图为 1918 年线条图裁切，分辨率约 360–520 px 宽，放大有限。
- 椎骨仅收录代表性单块（寰椎 / 枢椎 / C7 / T5 / L3），肋仅第 7 肋，掌 / 跖骨仅第 3，指 / 趾骨仅近节——按「种」覆盖，非按总数 206 块覆盖。