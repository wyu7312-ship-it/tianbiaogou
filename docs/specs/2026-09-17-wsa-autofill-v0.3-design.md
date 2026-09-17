# wsa-autofill v0.3 设计：概念表匹配 + 人称限定词 + 存储迁移 + GitHub 就绪仓库

日期：2026-09-17 ｜ 状态：已与用户逐节确认 ｜ 前置阅读：仓库根 `AGENTS.md`（隐私红线，最高优先级）

## 0. 背景与痛点（2026-09-17 用户反馈）

v0.1/v0.2 的字段识别 = 归一化后**子串匹配**手写的 22 组别名，导致：

1. **相似标签认不出**：字典有"手机号码"，遇到"移动号码 / 联系电话号码 / Contact Number / Tel"全部落空；
2. **"记住"越记越碎**：新标签按原文建独立条目，"移动号码"与"手机号"永不互通；
3. **同名多人字段混淆**：本人姓名/母亲姓名/紧急联系人姓名都命中"姓名"，候选混在一个池子里必然误填。

方案比选（已定）：A=内置概念表+限定词层（采纳）；B=纯模糊字符串（治不了英文与限定词，否）；C=调 LLM 分类（破坏零联网隐私架构，否）。B 的分词重叠思想并入 A 作第三级回退。

## 1. 仓库布局（git 仓库 = 扩展加载目录 = 唯一维护地）

位置：`C:\Users\x\Desktop\校招\wsa-autofill\`（自 `待清理\` 迁出；迁移完成后提醒用户删除旧副本、并在 chrome://extensions 重新"加载未打包"）。

```
wsa-autofill/
├── manifest.json          v0.3.0
├── content.js             识别/弹卡/写入/记住（核心逻辑所在）
├── concepts.js            🆕 概念表：中英文同义词 + 人称限定词（纯数据，便于持续扩充）
├── data.js                种子字典 —— 仅字段骨架与别名，候选值全部脱空（见 §5）
├── background.js          不变（仅负责打开 options 页）
├── options.html / options.js   字典管理页：升级到 v2 结构展示/编辑，含"导出到 private/"说明
├── test-form.html         回归页：新增 移动号码/Contact Number/母亲姓名/紧急联系人电话/身份证号 等场景
├── hooks-src/pre-commit   PII 扫描钩子源（.git/hooks/ 需手动 cp 安装，已在 AGENTS.md 说明）
├── tools/pii_check.sh     push 前全历史扫描
├── README.md              GitHub 门面：痛点→设计哲学(点选防错位·零联网·数据不出本机)→安装→截图占位→Roadmap
├── CHANGELOG.md           v0.1(9/10)→v0.2(9/11 弹卡可拖)→v0.3(本篇)
├── docs/specs/            设计文档归档（本文件）
├── private/               .gitignore：真实字典导出备份 + pii-patterns.txt 禁词表
└── .gitignore
```

## 2. 概念表（concepts.js）

```js
window.WSA_CONCEPTS = [
  { id:'name',  label:'姓名',  person:true,
    zh:['姓名','名字','真实姓名','姓','名'], en:['name','fullname','yourname'] },
  { id:'phone', label:'手机号', person:true,
    zh:['手机','手机号','手机号码','移动电话','联系电话','联系方式','电话','电话号码'],
    en:['phone','mobile','tel','telephone','contactnumber','phonenumber','mobileno'] },
  // …邮箱/性别/民族/出生日期/身份证号/籍贯/政治面貌/学历/学位/专业/毕业院校/
  //   毕业时间/起止时间/求职意向/期望工作地/英语成绩/普通话/计算机等级/驾照/
  //   工作经历-单位/工作职位/获奖/自我评价/家庭住址/紧急联系人-姓名/紧急联系人-电话 …
]
// 人称限定词（有序：命中即作为候选值的 scope 标签）
window.WSA_QUALIFIERS = [
  { key:'mother', words:['母亲','妈妈','母','妈'],      alias:'母亲' },
  { key:'father', words:['父亲','爸爸','父'],            alias:'父亲' },
  { key:'spouse', words:['配偶','爱人','妻子','丈夫'],   alias:'配偶' },
  { key:'emergency', words:['紧急联系人','联系人'],      alias:'紧急联系人' },
  { key:'self', words:['本人','自己','您的'],            alias:'本人' },
]
```

- 词表命中规则（第1级）：标签归一化后**完整包含**词表中某词（不反向包含，避免"号码"捞"房间号"）；多个概念命中按**命中词长度**降序（具体度）排前。
- `person:true` 的概念允许带 scope；`person:false`（如身份证号）候选值一律无 scope。

## 3. 匹配与弹卡流程（content.js）

```
focusin → haystack(现有五路检测不变)
  ├─ 第1级：同义词包含 → 概念命中列表
  ├─ 第2级（回退）：二字滑片重叠率 ≥0.5 → "≈可能匹配"标记（弱命中仍弹卡，用户判断）
  └─ 皆无 → 现行为（提示"先手填再记住"）
detectQualifier(hay)：命中限定词 → curScope（仅用于 remember 打标，不用于过滤候选）
render：命中概念的**全部**候选逐行列出（用户拍板：永远全列+tag 挑，不做自动代填）
  行格式 = [值]  [tag]，tag 含 scope 与来源概念（如 `母亲`、`≈学信网字段`）
  多概念命中时行间加概念分隔小标（防 电话/邮箱 混列误点）
fill / setNativeValue / setSelect / 拖动定位：不变
```

## 4. 存储 v2 + 自动迁移 + remember + 首启初始化向导

> 设计决策（2026-09-17 用户补充）：**扩展本身不携带任何个人数据**。仓库种子=空骨架，
> 每个用户（包括作者自己）的数据都来自"自己填一遍"——首次引导或日常"记住"。
> 这同时解决：README/演示绝不出现真人信息、GitHub 分发无隐私负担、新用户开箱可用。

```js
wsa_dict_v2 = {
  version: 2,
  concepts: {                       // 按概念归位
    phone: { userAliases:['移动号码'], options:[{value:'…',tag:'常用'}] }, …
  },
  custom: [ { label:'房间号', aliases:[…], options:[…] } ]   // 命不中概念的新字段独立成条
}
```

- 启动时：存在 v1 `wsa_dict` 且无 v2 → 迁移：逐条跑第1级匹配，命中→options 合并去重 + 原标签转 userAlias；命不中→进 custom。v1 原样保留为 `wsa_dict_backup_v1`（只读回滚用）。
- `remember()`：先走同一匹配 → 命中概念：值追加进该概念 options（tag=限定词识别结果或空）+ 未收录标签追加为 userAlias；命不中：建 custom 条。
- **首启初始化向导（options 页）**：检测到存储为空（全新安装）→ 顶部横幅"先花 2 分钟填一遍你的常用信息"：
  按 concepts.js 顺序生成表单（姓名/手机/邮箱/…身份证等敏感项标注"选填，只存本机"），每个值可展开"再加一个"
  （姓名→母亲/父亲/紧急联系人 scope）；提交写 chrome.storage v2；可随时"跳过"，之后靠"记住"增量积累。
  老用户迁移（v1→v2）不触发向导。向导的占位提示符一律用"张三 / 138xxxx0000 / you@example.com"（AGENTS.md 替身写法）。
- options 页与导入导出 JSON 同步升级读 v2；导入 v1 文件=触发同一迁移路径。

## 5. 隐私与脱敏（服从 AGENTS.md，此处只写落地点）

- 仓库内 `data.js`：只保留 label/aliases/概念骨架，`options: []` 全部清空；原 22 组真实值（手机/邮箱/获奖长文/自我评价全文）**不进入任何 commit**。
- 用户本机不受影响：chrome.storage 已有 v1 真值，升级后自动迁移。
- 身份证等敏感概念：只建槽位不预置值。
- 首个 commit 只含 docs/AGENTS/gitignore/hooks/tools；源码文件在 §6-P0 脱敏完成并经钩子验证后才入库，避免真值进入 git 历史（历史不可靠删除）。
- **零联网承诺（2026-09-17 用户增补，详见 AGENTS.md §四）**：v0.3 新增 ①options 页"一键清空本机字典"；
  ②测试套件加网络自检断言（源码 grep fetch/XHR/WebSocket/sendBeacon/storage.sync/host_permissions 须为 0 命中）；
  ③README 隐私章节：只写本地、用点选防错位、Chrome 自动填充为独立通道的提示。现状审计（9/17）：v0.2 代码外发通道为 0，manifest 权限仅 storage。

## 6. 实施顺序（供 writing-plans 展开）

- **P0 仓库奠基**（已完成大半）：目录/AGENTS/钩子/gitignore/本设计 → git init + 首 commit；验证钩子能拦截（用临时假号码试提交）。
- **P1 概念层**：写 concepts.js（≥25 概念 + 中英词表 + 限定词表）。
- **P2 匹配重写**：content.js matchEntries 三级化 + 卡片 tag 渲染；test-form.html 扩场景。
- **P3 remember+迁移+向导**：存储 v2、迁移函数、remember 归位；options 页适配；首启初始化向导（含 scope 展开）。
- **P4 种子脱敏**：data.js 清空真值；跑 pii_check.sh 全绿。
- **P5 自动化回归**：CDP 驱动 test-form（同 v0.1 的 13 项 + 新增：移动号码命中/Contact Number 命中/母亲姓名打标/迁移保值/模糊回退≈标记/多概念排序）。
- **P6 门面**：README.md + CHANGELOG.md + git 提交；截图/GIF 由用户实操后补（提醒打码）。
- **P7 交接**：AI浏览器 移除旧扩展→加载新路径→用户实测两个网申站→按反馈迭代。

## 7. 已知边界（延续 v0.1，不扩范围）

- 富文本编辑器/日期级联/验证码/上传不自动化；readonly 伪日期控件写入后框架状态可能不认，目检为准。
- 弹卡交互保持"只填当前框"，永不批量、永不自动提交（用户原始决策，优先级仅次于 AGENTS.md）。
