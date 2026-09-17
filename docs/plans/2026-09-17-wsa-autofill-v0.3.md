# 网申填充助手 v0.3 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 wsa-autofill 从"子串匹配+按标签记忆"升级为"概念表匹配+人称限定词+存储v2迁移+首启向导"，并把仓库整理成可公开上传 GitHub 的形态（零个人数据、零联网）。

**Architecture:** 逻辑与 UI 分离：新增 `concepts.js`（纯数据：概念/同义词/限定词）与 `matcher.js`（纯函数：匹配/迁移/行构建/向导schema），`content.js` 只做事件与 shadow DOM 渲染；options 页适配 v2 并新增清空+向导。所有纯函数在 `tests/unit.html` 内断言，UI 集成用 test-form.html + CDP 验证。

**Tech Stack:** Chrome MV3 扩展（原生 JS，无构建）、chrome.storage.local、python http.server + chrome-devtools MCP（CDP 测试）、git。

**规格来源:** `docs/specs/2026-09-17-wsa-autofill-v0.3-design.md`；隐私与零联网规则以根目录 `AGENTS.md` 为准。

## Global Constraints（每个任务都隐含遵守）

- 零联网：源码禁止 `fetch(|XMLHttpRequest|WebSocket|sendBeacon|storage.sync`，manifest `permissions` 仅 `["storage"]`（AGENTS.md §四）。
- 仓库内任何文件（含测试/示例/注释）禁止真实个人信息；演示值一律用 `张三`、`138xxxx0000`、`you@example.com`（AGENTS.md §一）。
- 种子 `data.js` 各概念 `options` 必须为空数组。
- 交互铁律不背离：只填当前框、永不批量、永不自动提交、候选永远全列+tag 由用户点选。
- 注释与 commit message 用中文，commit 前缀 `v0.3: `；标识符英文。
- 版本号：manifest `0.3.0`，content.js 内 `host.dataset.wsa = '0.3'`。
- 工作目录：`C:/Users/x/Desktop/校招/wsa-autofill/`（git 仓库=扩展加载目录）。旧版源码在 `C:/Users/x/Desktop/待清理/wsa-autofill/` 仅作移植参照，**不得把其 data.js 的真值复制进仓库**。
- 单元测试跑法（所有 Task 通用）：`python -m http.server 8777 --directory "C:/Users/x/Desktop/校招/wsa-autofill"`（后台），AI浏览器打开 `http://localhost:8777/tests/unit.html`，用 CDP `evaluate_script` 执行 `window.__report()`，期望返回含 `"fail":0`。
- 扩展源码改动后需重启 AI浏览器才生效（chrome 加载 unpacked 时机）；纯逻辑改动无需重启（unit.html 即时）。

## 文件结构

```
创建：concepts.js        概念+限定词数据（唯一需随站点增多而扩充的文件）
创建：matcher.js         norm/matchConcepts/detectQualifier/shingleScore/buildRows/migrateV1/seedV2/wizardFields
创建：tests/unit.html    断言套件（逻辑层测试，不依赖扩展加载）
修改：content.js         接 matcher，卡片全列+tag，remember 归位，存储 v2 读写
修改：options.html/js    v2 展示编辑 + 一键清空 + 首启向导
修改：data.js            重写为脱敏种子（仅由 concepts 生成骨架）
修改：manifest.json      0.3.0 + 注入 concepts.js/matcher.js
修改：test-form.html     新增 8 个场景框
修改：README.md/CHANGELOG.md（Task 7 创建/更新）
```

---

### Task 1: 移植骨架入库 + 模块拆分（matcher.js 空壳 + unit.html 框架）

**Files:**
- Create: `matcher.js`, `tests/unit.html`
- Copy-then-modify: 从 `待清理/wsa-autofill/` 复制 `content.js`、`background.js`、`options.html`、`options.js`、`test-form.html` 进仓库（data.js/manifest 手写不复制，防真值入库）
- Create: `manifest.json`（v0.3.0），Create: `data.js`（脱敏种子占位，Task 5 定稿）

**Interfaces:**
- Produces: `window.WSA = {}` 命名空间（matcher.js 尾行 `window.WSA = { norm }`，后续任务向 WSA 追加函数）；`tests/unit.html` 暴露 `window.__report() → {pass,fail,messages[]}`；content.js 顶部读 `window.WSA_CONCEPTS`、`window.WSA.norm`。

- [ ] **Step 1: 写失败测试**：创建 `tests/unit.html`

```html
<!DOCTYPE html><html><head><meta charset="utf-8"><title>wsa unit</title></head><body>
<script src="../concepts.js"></script><script src="../matcher.js"></script>
<script>
const R = { pass: 0, fail: 0, messages: [] };
function ok(name, cond) { cond ? R.pass++ : (R.fail++, R.messages.push(name)); }
// T1: WSA 骨架与 norm
ok('WSA存在', typeof window.WSA === 'object' && typeof WSA.norm === 'function');
ok('norm去空白标点', WSA.norm(' 手机：号码【1】 ') === '手机号码1');
window.__report = () => JSON.stringify(R);
document.body.append(JSON.stringify(R));
</script></body></html>
```

- [ ] **Step 2: 跑一遍确认失败**：起 8777 服务 → CDP 打开 unit.html → `__report()` 期望 `"fail":2`（concepts.js/matcher.js 尚不存在，脚本报 404 且 WSA undefined）。
- [ ] **Step 3: 移植旧文件**：

```bash
cd "C:/Users/x/Desktop/校招/wsa-autofill"
cp "/c/Users/x/Desktop/待清理/wsa-autofill/content.js" .
cp "/c/Users/x/Desktop/待清理/wsa-autofill/background.js" .
cp "/c/Users/x/Desktop/待清理/wsa-autofill/options.html" .
cp "/c/Users/x/Desktop/待清理/wsa-autofill/options.js" .
cp "/c/Users/x/Desktop/待清理/wsa-autofill/test-form.html" .
```

- [ ] **Step 4: 写 `matcher.js`（本任务仅 norm）**

```js
// 网申填充助手 · 纯逻辑层（无 DOM；tests/unit.html 直接加载测试）
(() => {
  'use strict';
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s:：*＊()（)）\[\]【】"'、.,，/·-]/g, ''); }
  window.WSA = { norm };
})();
```

- [ ] **Step 5: 写占位 `concepts.js`**（Task 2 会填满；本步只保证 404 消失）

```js
// 网申填充助手 · 概念表（纯数据）。扩充方法见 README「概念表维护」。禁止放入任何真实个人信息。
window.WSA_CONCEPTS = [];
window.WSA_QUALIFIERS = [];
```

- [ ] **Step 6: 写脱敏 `data.js` 占位**（不含任何值）

```js
// 网申填充助手 · 种子字典（骨架，候选值为空——真实数据由各用户本机"初始化向导/记住"产生，只进 chrome.storage）
window.WSA_DEFAULTS = { version: 2, concepts: {}, custom: [] };
```

- [ ] **Step 7: 写 `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "网申填充助手",
  "version": "0.3.0",
  "description": "点击输入框弹出已存信息，点选填入当前框；数据仅存本地，不联网。",
  "permissions": ["storage"],
  "background": { "service_worker": "background.js" },
  "options_page": "options.html",
  "content_scripts": [
    { "matches": ["http://*/*", "https://*/*"],
      "js": ["data.js", "concepts.js", "matcher.js", "content.js"],
      "run_at": "document_idle", "all_frames": true }
  ]
}
```

- [ ] **Step 8: 跑测试确认通过**：`__report()` 期望 `"fail":0`。
- [ ] **Step 9: 提交**

```bash
git add -A && git commit -m "v0.3: 移植v0.2源码入库，拆分matcher.js纯逻辑层+单测框架（种子脱敏）"
```

---

### Task 2: 概念表 concepts.js（全量）

**Files:**
- Modify: `concepts.js`
- Modify: `tests/unit.html`（追加 T2 数据完整性断言）

**Interfaces:**
- Produces: `window.WSA_CONCEPTS: Array<{id:string, label:string, person?:boolean, zh:string[], en:string[]}>`，id 全集见下（Task 3-6 按 id 取用）：`name phone email gender ethnicity birthdate idno hometown politics education degree major school grad_date period intent city company jobtitle english cet_score putonghua comp_level license award selfeval address qq emergency`
- Produces: `window.WSA_QUALIFIERS: Array<{key,words:string[],alias:string}>`，顺序即优先（emergency 含"联系人"必须排在最前命中长词）。

- [ ] **Step 1: 写失败测试**：unit.html 在 `__report` 赋值前追加：

```js
// T2: 概念表完整性
const C = window.WSA_CONCEPTS, Q = window.WSA_QUALIFIERS;
ok('概念数≥25', C.length >= 25);
const IDS = 'name phone email gender ethnicity birthdate idno hometown politics education degree major school grad_date period intent city company jobtitle english cet_score putonghua comp_level license award selfeval address qq emergency'.split(' ');
ok('id集合齐全', IDS.every(i => C.some(c => c.id === i)) && C.length === IDS.length);
ok('每概念有中文词', C.every(c => c.zh.length >= 2));
ok('姓名/电话是person概念', C.find(c=>c.id==='name').person === true && C.find(c=>c.id==='phone').person === true);
ok('身份证非person', C.find(c=>c.id==='idno').person !== true);
ok('限定词含母亲父亲配偶紧急联系人', ['mother','father','spouse','emergency'].every(k => Q.some(q => q.key === k)));
```

- [ ] **Step 2: 确认失败**：`"fail"` 增 ≥6。
- [ ] **Step 3: 填 concepts.js**（词表设计已定，直接落盘；注意 zh 用"短核词"保证包含命中，英文 en 词全部小写无空格）

```js
window.WSA_CONCEPTS = [
  { id:'name', label:'姓名', person:true, zh:['姓名','名字','真实姓名'], en:['name','fullname','yourname'] },
  { id:'phone', label:'手机号', person:true, zh:['手机','电话','号码','移动','联系方式','手机号','电话号码'], en:['phone','mobile','tel','telephone','contactnumber','phonenumber','mobilephone'] },
  { id:'email', label:'邮箱', person:true, zh:['邮箱','邮件','电子邮箱','电子邮件'], en:['email','mail'] },
  { id:'gender', label:'性别', zh:['性别'], en:['gender','sex'] },
  { id:'ethnicity', label:'民族', zh:['民族'], en:['ethnicity','nation'] },
  { id:'birthdate', label:'出生年月', person:true, zh:['出生','生日','出生日期','出生年月'], en:['birth','birthday','birthdate'] },
  { id:'idno', label:'身份证号', zh:['身份证','证件号','证件号码','身份编号'], en:['idcard','idnumber'] },
  { id:'hometown', label:'籍贯', zh:['籍贯','户籍','户口','生源地','家乡'], en:['nativeplace','hometown'] },
  { id:'politics', label:'政治面貌', zh:['政治面貌','党团情况','政治身份'], en:['politicalstatus'] },
  { id:'education', label:'学历', zh:['学历','文化程度','教育程度','最高学历'], en:['education','qualification','degreelevel'] },
  { id:'degree', label:'学位', zh:['学位','最高学位','学术学位'], en:['degree','bachelor','master'] },
  { id:'major', label:'专业', zh:['专业','所学专业','专业名称','所学专业名称'], en:['major','subject','specialization'] },
  { id:'school', label:'毕业院校', zh:['毕业院校','学校','院校','就读学校','毕业学校','大学'], en:['school','university','college','institute'] },
  { id:'grad_date', label:'毕业时间', zh:['毕业时间','毕业年月','预计毕业','离校时间'], en:['graduation','gradyear','graduationdate'] },
  { id:'period', label:'起止时间', zh:['起止','时间','年月起止','在职时间','任职时间'], en:['period','from','start','end'] },
  { id:'intent', label:'求职意向', zh:['求职意向','意向岗位','应聘岗位','期望职位','应聘志愿','志愿'], en:['position','intendedposition','desiredposition'] },
  { id:'city', label:'期望工作地', zh:['工作地','意向城市','期望城市','工作地点','工作城市','城市'], en:['location','city','worklocation','workplace'] },
  { id:'company', label:'工作经历-单位', zh:['单位','公司','工作单位','实习单位','公司名称','单位名称'], en:['company','employer','organization'] },
  { id:'jobtitle', label:'工作职位', zh:['职位','职务','岗位','工作内容','岗位职责'], en:['title','jobtitle','role','duty'] },
  { id:'english', label:'英语水平', zh:['英语','外语','英语水平','英语等级','外语水平'], en:['english','cet','toefl','ielts'] },
  { id:'cet_score', label:'英语成绩', zh:['成绩','分数','成绩分数'], en:['score'] },
  { id:'putonghua', label:'普通话等级', zh:['普通话'], en:['mandarin','psh','putonghua'] },
  { id:'comp_level', label:'计算机等级', zh:['计算机'], en:['computer'] },
  { id:'license', label:'驾照', zh:['驾照','驾驶证','准驾'], en:['license','driving'] },
  { id:'award', label:'获奖情况', zh:['获奖','荣誉','奖励','奖学金','奖项'], en:['award','honor','prize','scholarship'] },
  { id:'selfeval', label:'自我评价', zh:['自我评价','个人评价','个人小结','自我介绍','个人简介','自荐'], en:['aboutme','selfevaluation','summary','description'] },
  { id:'address', label:'家庭住址', person:true, zh:['住址','地址','通讯地址','居住地'], en:['address','addresshome'] },
  { id:'qq', label:'QQ号', person:true, zh:['qq','qq号','企鹅'], en:['qq'] },
  { id:'emergency', label:'紧急联系人', person:true, zh:['紧急联系人','联系人','紧急联系方式'], en:['emergency','emergencycontact'] },
];
// 顺序=优先级：长词在前，避免"联系人"抢走"紧急联系人"
window.WSA_QUALIFIERS = [
  { key:'emergency', alias:'紧急联系人', words:['紧急联系人','紧急联系'] },
  { key:'mother', alias:'母亲', words:['母亲','妈妈','爸妈母'] }, // 注：'爸妈母'为误写防护位，实际删除——仅保留 ['母亲','妈妈']
  { key:'father', alias:'父亲', words:['父亲','爸爸'] },
  { key:'spouse', alias:'配偶', words:['配偶','爱人','妻子','丈夫'] },
  { key:'other', alias:'其他亲属', words:['亲属','家人','朋友'] },
  { key:'self', alias:'本人', words:['本人','自己','您的','申请人'] },
];
```

**修正**：mother 行按注释删成 `{ key:'mother', alias:'母亲', words:['母亲','妈妈'] }` 后再提交（上面保留注释是提醒实现者检查）。

- [ ] **Step 4: 跑测试**：`"fail":0`。
- [ ] **Step 5: 提交** `git commit -am "v0.3: 概念表29项+人称限定词6档"`

---

### Task 3: 匹配核心（matchConcepts / shingleScore / detectQualifier / buildRows）

**Files:**
- Modify: `matcher.js`
- Modify: `tests/unit.html`

**Interfaces:**
- Consumes: `WSA_CONCEPTS`、`WSA_QUALIFIERS`（Task 2）。
- Produces（挂到 `window.WSA`）：
  - `matchConcepts(hay: string[], dict): Array<{concept, score}>` —— 命中=归一化标签**完整包含**概念词；排序=score 降序；最多返回 4。`dict` 为 v2 存储对象（用 `dict.concepts[id].userAliases` 与 `dict.custom` 参与匹配）。
  - `shingleScore(a: string, b: string): number`（二字滑片重叠/较短方）
  - `detectQualifier(hay: string[]): string|null`（返回 alias，如 '母亲'；命中限定词+person 概念时用于 remember 打标）
  - `buildRows(hay: string[], dict): Array<{value:string, tag:string, label:string, weak:boolean}>` —— 卡片行模型：强命中概念全列候选；若无强命中，取 shingle≥0.5 的概念作弱命中（weak:true）；每行 tag=option.tag，label=概念中文名；跨概念按 score 排。

- [ ] **Step 1: 写失败测试**：unit.html 追加（`D` 为内存 v2 样例字典，值全用替身）

```js
// T3: 匹配核心
const D = { version:2, concepts:{}, custom:[] };
for (const c of C) D.concepts[c.id] = { userAliases: [], options: [] };
D.concepts.phone.options.push({ value:'138xxxx0000' });
D.concepts.name.options.push({ value:'张三' }, { value:'李母', tag:'母亲' }, { value:'老王', tag:'紧急联系人' });
const m = (hay) => WSA.matchConcepts(hay, D).map(h => h.concept.id);
ok('移动号码→phone', m(['移动号码'])[0] === 'phone');
ok('Contact Number→phone', m(['Contact Number'])[0] === 'phone');
ok('联系电话→phone优先于emergency', m(['联系电话']).includes('phone'));
ok('房间号不误报phone', !m(['房间号']).includes('phone'));
ok('母亲姓名→name', m(['母亲姓名'])[0] === 'name');
ok('紧急联系人电话→phone命中', m(['紧急联系人电话']).includes('phone'));
ok('限定词母亲', WSA.detectQualifier(['母亲姓名']) === '母亲');
ok('限定词紧急联系人优先', WSA.detectQualifier(['紧急联系人电话']) === '紧急联系人');
ok('无限定词返回null', WSA.detectQualifier(['姓名']) === null);
const rows = WSA.buildRows(['姓名'], D);
ok('姓名框全列3候选', rows.length === 3);
ok('候选带tag', rows.some(r => r.tag === '母亲') && rows.some(r => r.tag === '紧急联系人'));
const w = WSA.buildRows(['学信网邮箱'], { ...D, concepts: D.concepts }); // '学信网邮箱'含'邮箱'→强命中不算弱
ok('弱命中示例', WSA.buildRows(['常用邮编'], D).every(r => r.weak === true) && WSA.shingleScore('邮编','邮箱') > 0);
```

- [ ] **Step 2: 确认失败**（WSA.matchConcepts undefined，TypeError 包裹计数亦可 → 直接看 fail>0）。
- [ ] **Step 3: 实现 matcher.js 追加**（norm 之后、`window.WSA` 赋值改为逐键挂载）

```js
function bigrams(s) { const a = []; for (let i = 0; i < s.length - 1; i++) a.push(s.slice(i, i + 2)); return a; }
function shingleScore(a, b) {
  const A = new Set(bigrams(a)), B = new Set(bigrams(b));
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((x) => { if (B.has(x)) n++; });
  return n / Math.min(A.size, B.size);
}
function wordsOf(c, dict) {
  const extra = (dict && dict.concepts && dict.concepts[c.id] ? dict.concepts[c.id].userAliases : []).slice();
  return c.zh.concat(c.en, extra).map(norm).filter((w) => w && w.length >= 2);
}
function matchConcepts(hay, dict) {
  const hn = hay.map(norm).filter((s) => s.length >= 2);
  const out = [];
  for (const c of (window.WSA_CONCEPTS || [])) {
    let best = 0;
    for (const w of wordsOf(c, dict)) for (const h of hn) if (h.includes(w)) { if (w.length > best) best = w.length; }
    if (best) out.push({ concept: c, score: best });
  }
  for (const cu of ((dict && dict.custom) || [])) {
    let best = 0;
    for (const w of [cu.label].concat(cu.aliases || []).map(norm).filter((x) => x.length >= 2))
      for (const h of hn) if (h.includes(w)) { if (w.length > best) best = w.length; }
    if (best) out.push({ concept: { id: 'custom:' + cu.label, label: cu.label, custom: cu }, score: best });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 4);
}
function detectQualifier(hay) {
  const hn = hay.map(norm);
  for (const q of (window.WSA_QUALIFIERS || []))
    for (const w of q.words) if (hn.some((h) => h.includes(norm(w)))) return q.alias;
  return null;
}
function buildRows(hay, dict) {
  let hits = matchConcepts(hay, dict);
  let weak = false;
  if (!hits.length) { // 弱回退：与概念名/主词二字重叠≥0.5
    hits = [];
    const hs = hay.map(norm).filter((s) => s.length >= 2);
    for (const c of (window.WSA_CONCEPTS || [])) {
      const pool = [c.label].concat(c.zh.slice(0, 2)).map(norm);
      let score = 0;
      for (const h of hs) for (const p of pool) score = Math.max(score, shingleScore(h, p));
      if (score >= 0.5) hits.push({ concept: c, score });
    }
    hits.sort((a, b) => b.score - a.score);
    weak = true;
    hits = hits.slice(0, 3);
  }
  const rows = [];
  for (const { concept } of hits) {
    const opts = concept.custom ? concept.custom.options
      : ((dict.concepts && dict.concepts[concept.id]) || {}).options || [];
    for (const o of opts) {
      if (rows.length >= 14) break;
      rows.push({ value: o.value, tag: o.tag || '', label: concept.label, weak });
    }
  }
  return rows;
}
```

并把尾行改为：`window.WSA = { norm, bigrams, shingleScore, matchConcepts, detectQualifier, buildRows };`

- [ ] **Step 4: 跑测试** `"fail":0`（若"房间号"用例因 `号码`/`号` 失败，检查 zh 词表勿留单字'号'）。
- [ ] **Step 5: 提交** `"v0.3: 三级匹配核心（同义词具体度排序+二字滑片回退+限定词识别）"`

---

### Task 4: 存储 v2 + v1 自动迁移 + 种子装载

**Files:**
- Modify: `matcher.js`（追加 `migrateV1`、`seedV2`）
- Modify: `tests/unit.html`

**Interfaces:**
- Produces: `WSA.migrateV1(v1list: Array<{label,aliases,options}>, concepts): v2` —— 每条 v1：matchConcepts 命中→值合入该概念 options（去重）+ 原 label 非内建词则进 userAliases + 若 label 含限定词且 option 无 tag 则补 tag；未命中→custom 原样保留。v2 结构 `{version:2, concepts:{id:{userAliases,options}}, custom:[]}`。
- Produces: `WSA.seedV2(): v2` —— 由 WSA_CONCEPTS 生成空 options 的 v2。
- content.js 存储协议：读 `wsa_dict_v2` →无则若有 `wsa_dict` 跑 migrate 并写 `wsa_dict_backup_v1` + `wsa_dict_v2` →皆无写 seedV2。

- [ ] **Step 1: 写失败测试**

```js
// T4: 迁移
const V1 = [
  { label:'移动号码', aliases:['移动号码'], options:[{ value:'138xxxx0000' }] },
  { label:'母亲姓名', aliases:['母亲姓名'], options:[{ value:'李母' }] },
  { label:'楼层编号', aliases:['楼层编号'], options:[{ value:'3层' }] },
  { label:'自我评价', aliases:['自我评价'], options:[{ value:'样例文本' }] },
];
const V2 = WSA.migrateV1(V1, C);
ok('手机号归入phone', V2.concepts.phone.options.some(o => o.value === '138xxxx0000'));
ok('移动号码成为别名', V2.concepts.phone.userAliases.includes('移动号码'));
ok('母亲姓名带scope', V2.concepts.name.options.some(o => o.value === '李母' && o.tag === '母亲'));
ok('楼层编号进custom', V2.custom.some(e => e.label === '楼层编号'));
ok('自我评价进概念', V2.concepts.selfeval.options.length === 1);
ok('迁移幂等', JSON.stringify(WSA.migrateV1(V1, C).concepts.phone.userAliases) === JSON.stringify(V2.concepts.phone.userAliases));
const S = WSA.seedV2();
ok('种子全空值', Object.values(S.concepts).every((x) => x.options.length === 0));
```

- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现 migrateV1 / seedV2**

```js
function builtinWord(label, c) { return c.zh.concat(c.en).some((w) => norm(w) === norm(label)); }
function seedV2() {
  const concepts = {};
  for (const c of (window.WSA_CONCEPTS || [])) concepts[c.id] = { userAliases: [], options: [] };
  return { version: 2, concepts, custom: [] };
}
function migrateV1(v1list, concepts) {
  const v2 = seedV2();
  for (const e of (v1list || [])) {
    const hits = matchConcepts([e.label].concat(e.aliases || []), v2);
    const scope = detectQualifier([e.label].concat(e.aliases || []));
    if (hits.length && !hits[0].concept.custom) {
      const slot = v2.concepts[hits[0].concept.id];
      if (e.label && !builtinWord(e.label, hits[0].concept) && !slot.userAliases.includes(e.label)) slot.userAliases.push(e.label);
      for (const o of (e.options || [])) {
        const no = { value: o.value, tag: o.tag || (scope && hits[0].concept.person ? scope : '') || '' };
        if (!slot.options.some((x) => x.value === no.value && x.tag === no.tag)) slot.options.push(no);
      }
    } else {
      const ex = v2.custom.find((x) => x.label === e.label);
      if (ex) { for (const o of (e.options || [])) if (!ex.options.some((x) => x.value === o.value)) ex.options.push(o); }
      else v2.custom.push({ label: e.label, aliases: (e.aliases || []).slice(), options: (e.options || []).slice() });
    }
  }
  return v2;
}
```

（migrateV1 内部直接用 `window.WSA_CONCEPTS`，签名保留 concepts 参数以兼容测试写法。）尾行挂载追加两个函数。

- [ ] **Step 4: 跑测试** `"fail":0`。
- [ ] **Step 5: 提交** `"v0.3: 存储v2迁移（碎标签自动归位+backup保留+幂等）"`

---

### Task 5: content.js 接线（弹卡新流程 + remember 归位 + 存储协议）

**Files:**
- Modify: `content.js`
- Modify: `data.js`（定稿：由 seedV2 生成，仍全空值）
- Modify: `test-form.html`（新增 8 场景框）
- Modify: `tests/unit.html`（追加断言：test-form 场景 → buildRows 输出）

**Interfaces:**
- Consumes: Task 3/4 全部函数。
- Produces: content.js 运行时协议 `window.__wsaInjected`、`host.dataset.wsa==='0.3'`（集成测试探针）；`remember()` 行为：命中概念→options+userAliases 归位（toast 显示"已记住 → 归入「X」"）；命不中→custom。

- [ ] **Step 1: 写失败测试（集成前置断言）**：unit.html 追加

```js
// T5: test-form 场景 → 行模型（先建 fixture 字典）
const F = WSA.seedV2();
F.concepts.name.options.push({ value:'张三' }, { value:'李母', tag:'母亲' });
F.concepts.phone.options.push({ value:'138xxxx0000' });
F.concepts.idno.options.push({ value:'证件号示例X' }); // 用文字占位，勿写18位数字面值（会触发PII钩子）
const cases = [
  [['移动号码'],'phone'], [['Contact Number'],'phone'], [['母亲姓名'],'name'],
  [['紧急联系人电话'],'emergency|phone'], [['身份证号'],'idno'], [['毕业时间'],'grad_date'],
];
for (const [hay, want] of cases) {
  const got = WSA.matchConcepts(hay, F).map(h => h.concept.id);
  ok('场景' + hay[0], want.split('|').some((w) => got[0] === w || got.includes(w)));
}
ok('姓名列本人母亲两条', WSA.buildRows(['姓名'], F).length === 2);
```

（假证件号行简化为 `F.concepts.idno.options.push({ value:'证件号示例X' })` 即可，避免正则造号触发钩子。）
- [ ] **Step 2: 确认失败**（'紧急联系人电话'若 top 命中 phone 已算过——见 want 写法；其余概念表在 T2 已就绪，此步预期 pass；content.js 行为在 Step 5 后用 unit.html 逻辑层回归即可，**真正失败点**在 F 未定义前的语法——先跑看 fail 再进入实现，若全绿则记录"逻辑层无回归"）。
- [ ] **Step 3: 改 content.js 存储装载**（替换原 `chrome.storage.local.get('wsa_dict', ...)` 整段）：

```js
let dict = null;
function ensureDict(cb) {
  chrome.storage.local.get(['wsa_dict_v2', 'wsa_dict'], (res) => {
    let v2 = res && res.wsa_dict_v2;
    if (!v2 || !v2.concepts) {
      v2 = (res && Array.isArray(res.wsa_dict) && res.wsa_dict.length)
        ? WSA.migrateV1(res.wsa_dict, window.WSA_CONCEPTS)
        : (window.WSA_DEFAULTS && window.WSA_DEFAULTS.version === 2 ? JSON.parse(JSON.stringify(window.WSA_DEFAULTS)) : WSA.seedV2());
      const put = { wsa_dict_v2: v2 };
      if (res && Array.isArray(res.wsa_dict) && res.wsa_dict.length) put.wsa_dict_backup_v1 = res.wsa_dict;
      chrome.storage.local.set(put);
    }
    dict = v2; cb && cb();
  });
}
ensureDict();
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch.wsa_dict_v2) { dict = ch.wsa_dict_v2.newValue; if (state.el && panelVisible()) render(); }
});
```

同时把 `dict === null` 的守卫改为 `if (!dict) return;`，`ensureDict()` 完成后若当前框激活则补渲染（原回调逻辑）。onChanged 的键名监听从 `wsa_dict` 改为 `wsa_dict_v2`。

- [ ] **Step 4: 改 matchEntries→buildRows**：删除旧 `matchEntries`；`render()` 里改为：

```js
const rows = dict ? WSA.buildRows(state.hay, dict) : [];
const label = firstLabel(state.hay);
const scope = WSA.detectQualifier(state.hay);
head 的字段数显示 = new Set(rows.map(r=>r.label)).size + ' 个字段';
body 循环 rows：每行 val=row.value；tag 区=row.tag ? row.tag : ''；若 rows 来源 label 种类>1，行左再加灰色概念名 `r.label`（`class .src` 样式：`font-size:11px;color:#8896a6;margin-right:6px`）；弱命中行前缀 `≈ `；空 rows 时保留原"＋记住"提示行。
fill 不变。
```

- [ ] **Step 5: 重写 remember()**：

```js
function remember() {
  const el = state.el, value = el && el.value;
  if (!value) { toast('请先在该框输入内容，再点「记住」', true); return; }
  const hits = WSA.matchConcepts(state.hay, dict);
  const scope = WSA.detectQualifier(state.hay);
  const rawLabel = firstLabel(state.hay);
  if (hits.length) {
    const c = hits[0].concept;
    if (c.custom) {
      if (!c.custom.options.some((o) => o.value === value)) c.custom.options.push({ value, tag: scope || '' });
    } else {
      const slot = dict.concepts[c.id];
      if (rawLabel && !slot.userAliases.includes(rawLabel)) slot.userAliases.push(rawLabel);
      const tag = (scope && c.person) ? scope : '';
      if (!slot.options.some((o) => o.value === value && (o.tag || '') === tag)) slot.options.push({ value, tag });
    }
    chrome.storage.local.set({ wsa_dict_v2: dict });
    toast('已记住 → 归入「' + c.label + '」' + (tagOfToast(scope, c) ? '·' + scope : ''));
  } else {
    if (!rawLabel) { toast('未识别出该框标签，请到 字典管理 页手动添加', true); return; }
    let e = dict.custom.find((x) => x.label === rawLabel);
    if (!e) { e = { label: rawLabel, aliases: [rawLabel], options: [] }; dict.custom.push(e); }
    if (!e.options.some((o) => o.value === value)) e.options.push({ value, tag: scope || '' });
    chrome.storage.local.set({ wsa_dict_v2: dict });
    toast('新字段「' + rawLabel + '」已独立保存 ✔');
  }
}
function tagOfToast(scope, c) { return scope && c.person; }
```

- [ ] **Step 6: test-form.html 追加 8 框**（每框独立 `.fi` 结构照抄现有样式；标签：移动号码 / Contact Number / 母亲姓名 / 父亲姓名 / 紧急联系人电话 / 身份证号 / 毕业时间 / 楼层编号）+ data.js 定稿注释保持空 options。
- [ ] **Step 7: unit.html 全量 `"fail":0`**；提交 `"v0.3: content接线——卡片全列带scope标签+remember自动归位"`

---

### Task 6: options 页升级（v2 编辑 + 一键清空 + 首启向导）

**Files:**
- Modify: `options.html`、`options.js`
- Modify: `tests/unit.html`（wizardFields 断言）

**Interfaces:**
- Produces: `WSA.wizardFields(): Array<{id,label,person,zhHint,secret:boolean}>` —— secret=true 的项（idno/birthdate/phone/email/address/qq/emergency）界面标"选填·只存本机"。
- options.js 行为：渲染 v2（有值概念置顶、含 custom）；每 option 行【值|tag|删】；概念级 userAliases 逗号编辑；按钮组【导出】【导入】【一键清空本机字典（二次确认）】；`wsa_dict_v2` 缺失或全空 → 顶部向导横幅。

- [ ] **Step 1: 写失败测试**

```js
// T6: 向导 schema
const WF = WSA.wizardFields();
ok('向导含姓名手机邮箱', ['name','phone','email'].every(i => WF.some(f => f.id === i)));
ok('敏感项标secret', WF.find(f => f.id === 'idno').secret === true);
ok('非敏感项不secret', WF.find(f => f.id === 'gender').secret !== true);
```

- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: matcher.js 追加**

```js
const SECRET_IDS = ['idno', 'birthdate', 'phone', 'email', 'address', 'qq', 'emergency'];
function wizardFields() {
  return (window.WSA_CONCEPTS || []).map((c) => ({
    id: c.id, label: c.label, person: !!c.person,
    zhHint: c.zh.slice(0, 3).join('/'),
    secret: SECRET_IDS.includes(c.id),
  }));
}
```

- [ ] **Step 4: 重写 options.html/options.js**（要点实现，完整代码见 v0.3 分支提交；关键骨架）：

```html
<!-- options.html 新增区 -->
<div id="wizard" hidden>先花2分钟填一遍常用信息 → 之后填表点框即有候选（全部只存本机）</div>
<form id="wizform"><ol id="wizlist"></ol><button type="submit">保存字典</button><a id="wizskip">跳过，边用边记</a></form>
```

```js
// options.js：加载 v2 渲染 + 向导构建 + 清空
function renderWiz() {
  if (localStorageHasDict()) { wiz.hidden = true; return; }
  wiz.hidden = false;
  wizlist.innerHTML = WSA.wizardFields().map((f) =>
    `<li><label>${f.label}${f.secret ? '（选填·只存本机）' : ''}
      <input data-id="${f.id}" placeholder="${f.id === 'name' ? '张三' : f.id === 'phone' ? '138xxxx0000' : ''}">
      ${f.person ? '<select data-scope><option>本人</option><option>母亲</option><option>父亲</option><option>配偶</option><option>紧急联系人</option></select>' : ''}
    </label></li>`).join('');
}
// 提交：非空 input → dict.concepts[id].options.push({value, tag:scope==='本人'?'':scope})
// 清空：confirm('将删除本机保存的全部字典，不可恢复；导出备份了吗？') → confirm 再来一次 → chrome.storage.local.remove(['wsa_dict_v2']) → reload 列表
```

（编辑区渲染、导入导出沿用 v0.2 代码结构，仅键名 wsa_dict→wsa_dict_v2 与数据形状 v2 化；导出文件名建议 `wsa-dict-备份.json` 且提示保存到 `private/`。）

- [ ] **Step 5: unit `"fail":0`**；`bash -c 'cd repo && grep -nE "1347|wangy|@[0-9a-z]+\.(qq|163)\." options.* data.js'` 期望无输出（脱敏目检）。
- [ ] **Step 6: 提交** `"v0.3: options页v2化+一键清空+首启初始化向导（假名占位）"`

---

### Task 7: 网络自检 + 集成回归 + 门面文档

**Files:**
- Modify: `tests/unit.html`（网络自检断言 fetch 源码文本）
- Create: `README.md`；Modify: `CHANGELOG.md`

- [ ] **Step 1: unit.html 加网络自检**（同源拉取全部 JS 源码，扫描违禁模式；扩展页面禁 fetch 但测试页可用 XMLHttpRequest 读本地文件？MV3 页面均可 fetch 本地同源文件——测试页不是扩展页，无妨）

```js
// T7: 零联网自检（读源码文本而非执行）
const SRCS = ['../content.js', '../matcher.js', '../concepts.js', '../data.js', '../background.js', '../options.js'];
const BANNED = /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|storage\.sync|host_permissions/;
Promise.all(SRCS.map(u => fetch(u).then(r => r.text()).catch(() => ''))).then((all) => {
  all.forEach((t, i) => ok('无外发通道:' + SRCS[i], !BANNED.test(t)));
  fetch('../manifest.json').then(r => r.text()).then(m => ok('manifest权限仅storage', /"permissions"\s*:\s*\[\s*"storage"\s*\]/.test(m) && !/host_permissions/.test(m)));
  document.body.append(JSON.stringify(R));
});
```

（注意：BANNED 正则会命中 unit.html 自身？不——只扫 SRCS 六个文件。）
- [ ] **Step 2: 跑通全部单测** `"fail":0`。
- [ ] **Step 3: 集成回归（需浏览器重启）**：AI浏览器关闭 → 用 `C:\Users\x\Desktop\start-ai-browser.bat` 重启 → chrome://extensions 移除旧扩展（待清理路径）、开发者模式"加载未打包"选新仓库目录 → python http.server 8777 → 打开 `http://localhost:8777/test-form.html` → CDP 断言序列：①清空 storage 后点"姓名"框 → `host.dataset.wsa==='0.3'`；②options 向导可见→填张三/138xxxx0000 保存；③回 test-form 点"母亲姓名"框→卡片两行且含 tag=母亲；④点候选→值进框、只进该框；⑤手动在"楼层编号"填 3层 点记住→toast 含"独立保存"；⑥点"移动号码"框→弹手机候选（归位生效）。
- [ ] **Step 4: `bash tools/pii_check.sh` 期望 ✅**。
- [ ] **Step 5: 写 README.md**（结构：一句话简介/3 痛点场景/设计哲学三条【点选防错位·零联网·自填零携带】/安装步骤（加载未打包+重启提示）/使用动图占位 `<!-- TODO截图:打码后替换，AGENTS.md §一 -->`/概念表维护指南（往 concepts.js 加词，示例假词）/隐私声明（含 Chrome 自动填充独立通道提示）/Roadmap：站点级别名 profile、字典导入导出 v2 说明、CHANGELOG 链接）。
- [ ] **Step 6: CHANGELOG.md**：v0.1 2026-09-10 建成+13/13 测试；v0.2 2026-09-11 弹卡右置+拖动记忆位；v0.3 2026-09-xx 概念表匹配/中英同义/人称scope/存储迁移/首启向导/脱敏入库+PII钩子。
- [ ] **Step 7: 提交 + push 前检查**（push 由用户决定 GitHub 仓库名后进行，AGENTS.md §二.2 流程）。

---

### Task 8: 用户侧交接 + memory 更新

- [ ] **Step 1:** 给用户一页操作卡：重启AI浏览器→移除旧扩展→加载 `Desktop\校招\wsa-autofill`→随便开个网申页点"姓名"框验证→真实字典由本机 v1 自动迁移（旧键 wsa_dict_backup_v1 保留可回滚）→在 `private/` 放一份导出备份（gitignore 已护）。
- [ ] **Step 2:** 实测 2 个真实网申站（如国聘/北森系各一），记录误命中/漏命中 → 只改 `concepts.js` 词表热修（改后重启浏览器）。
- [ ] **Step 3:** 更新 memory `网申填充助手扩展.md`：新路径/概念表架构/v0.3 行为/零联网与 PII 钩子/待清理旧目录可删。
- [ ] **Step 4:** 用户确认后删除 `待清理\wsa-autofill` 旧副本。

## Self-Review 结论

- 覆盖检查：spec §1→Task1/7；§2→Task2/3；§3→Task3/5；§4→Task4/5/6；§5 隐私→Task1/6/7+Global；零联网→Task7；测试→各 Task Step1/2 + Task7 Step3。无缺口。
- 已知取舍：zh 短核词（'号码'）可能弱误命中"房间号"类框——由"全列+tag 人工点选"兜底，且 buildRows 上限 14 行防刷屏；集成回归必须浏览器重启，中间任务不重启（纯逻辑用 unit.html）。
