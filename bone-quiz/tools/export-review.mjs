import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');
const { questions } = JSON.parse(readFileSync(join(assets, 'questions.json'), 'utf8'));
const bones = JSON.parse(readFileSync(join(assets, 'bones.json'), 'utf8')).bones;
const byId = Object.fromEntries(bones.map(b => [b.id, b]));
const SCOPE_NAME = { skull: '颅骨', trunk: '躯干骨', upper: '上肢骨', lower: '下肢骨' };
const KIND_NAME = { mcq: '选择题', tf: '判断题' };

const cell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const rows = [['序号', '题目ID', '题型', '范围', '关联骨', '题干', '选项A', '选项B', '选项C', '选项D', '正确答案', '解析', '审核结论(通过/修改/删除)', '修改意见']];
let n = 0;
for (const q of questions) {
  if (q.reviewed) continue;
  n++;
  const bone = q.bone && byId[q.bone] ? byId[q.bone].cn.replace(/_/g, ' · ') : '';
  const stem = q.kind === 'mcq' ? q.stem : q.statement;
  const opts = q.kind === 'mcq' ? q.options : ['正确', '错误', '', ''];
  const answer = q.kind === 'mcq' ? `${'ABCD'[q.answer]}. ${q.options[q.answer]}` : (q.answer ? '正确' : '错误');
  rows.push([n, q.id, KIND_NAME[q.kind], SCOPE_NAME[q.scope] || q.scope, bone, stem, ...opts, answer, q.explain || '', '', '']);
}
const outDir = join(root, '..', 'handoff');
mkdirSync(outDir, { recursive: true });
const csv = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
writeFileSync(join(outDir, '待审核题清单.csv'), csv);
console.log('exported', n, 'questions →', join(outDir, '待审核题清单.csv'));