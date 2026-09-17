// harness.js —— 免重启验证 content.js 的测试驱动
// 机制：把 data.js/concepts.js/matcher.js/content.js 拼成一个 bundle，用 <script> 注入主世界，
//      由页面内的 chrome.storage 垫片驱动。改完源码只需重新点"注入"，无需重启浏览器。
// 判定：卡片标题是否取到"真标签"（而非占位符/裸 id/错误提示），以及写入是否真的生效。

const H = {};
const HOSTID = () => (document.documentElement && document.documentElement.dataset.wsaHostId) || '__wsa_host__';
window.__H = H;

// 用户本机字典形态的假名替身（与 AGENTS.md §一 一致，绝不含真值）
const FILLED = {
  name: '张三', phone: '138xxxx0000', email: 'you@example.com', idno: '证件号示例X',
  birthdate: '199x.xx.xx', gender: '男', ethnicity: '汉', politics: '共青团员',
  hometown: '某某省某某市', school: '某某大学', education: '硕士', degree: '文学学位',
  major: '某某专业', grad_date: '2027.6.1', period: '2024.9.1',
};

H.load = async function load(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = res; s.onerror = () => rej(new Error('load fail: ' + src));
    document.head.appendChild(s);
  });
};

H.seed = function seed() {
  const concepts = {};
  for (const c of window.WSA_CONCEPTS) {
    concepts[c.id] = { userAliases: [], options: FILLED[c.id] ? [{ value: FILLED[c.id] }] : [] };
  }
  return new Promise((res) => {
    chrome.storage.local.set({ wsa_dict_v2: { version: 2, concepts, custom: [] } }, () => {
      // 垫片的 set 回调是 setTimeout，稍等再继续
      setTimeout(res, 30);
    });
  });
};

// 注入 bundle：先清掉上一次的 host 与注入标记，再顺序求值三份源码
H.inject = async function inject(bundleText) {
  const old = document.getElementById(HOSTID());
  if (old) old.remove();
  delete window.__wsaInjected;
  window.WSA = undefined;

  // content.js 的 ensureDict 会读 storage，必须在求值前把字播种好
  if (!window.WSA_CONCEPTS) { await H.load('../concepts.js'); }
  await H.seed();
  await H.tick(60);

  try { (0, eval)(bundleText); } catch (e) {
    document.getElementById('status').textContent = 'bundle 执行抛错：' + e.message;
    throw e;
  }
  await H.tick(350); // 等 ensureDict 回调 + 渲染
  document.getElementById('status').textContent = '已注入修复版 bundle';
  const host = document.getElementById(HOSTID());
  document.getElementById('ver').textContent = host ? '（探针版本 ' + host.dataset.wsa + '）' : '（未创建 host）';
};

H.tick = (ms) => new Promise((r) => setTimeout(r, ms || 60));

H.panel = function panel() {
  const h = document.getElementById(HOSTID());
  return h && h.shadowRoot ? h.shadowRoot.querySelector('.panel') : null;
};

// 读当前卡片状态
H.card = function card() {
  const p = H.panel();
  if (!p || p.style.display === 'none') return { visible: false, title: '', labels: '', rows: [], hint: '', toast: '' };
  const hb = p.querySelector('.head .box');
  const hc = p.querySelector('.head span:last-child');
  const hn = p.querySelector('.hint');
  const ht = p.querySelector('.toast');
  return {
    visible: true,
    title: hb ? hb.textContent.replace('框：', '').trim() : '',
    labels: hc ? hc.textContent.trim() : '',
    rows: Array.from(p.querySelectorAll('.row')).filter((r) => !r.classList.contains('add'))
      .map((r) => ({ weak: r.textContent.includes('≈'), txt: r.textContent.trim().replace(/\s+/g, ' ') })),
    hint: hn ? hn.textContent.trim() : '',
    toast: ht ? ht.textContent.trim() : '',
  };
};

H.focus = async function focus(id) {
  const el = document.getElementById(id);
  el.blur(); await H.tick(25); el.focus(); await H.tick(170);
  return H.card();
};

// 点第 n 个候选（用于验证写入）。fill() 是同步的：点击即写入并弹 toast，
// 因此必须在同步上下文里先抓 toast，再等异步 tick（点选可能触发页面 focus 变化→面板隐藏）。
H.clickRow = async function clickRow(n) {
  const p = H.panel();
  const rows = Array.from(p.querySelectorAll('.row')).filter((r) => !r.classList.contains('add'));
  if (!rows[n]) return { toast: '', clicked: false };
  rows[n].click();
  const t = p.querySelector('.toast');
  const toast = t ? t.textContent.trim() : '';
  await H.tick(120);
  return { toast, clicked: true };
};

H.clickAdd = async function clickAdd() {
  const p = H.panel();
  const b = p.querySelector('.row.add');
  if (!b) return { toast: '', clicked: false };
  b.click();
  const t = p.querySelector('.toast');
  const toast = t ? t.textContent.trim() : '';
  await H.tick(140);
  return { toast, clicked: true };
};

// ===== 用例表：期望卡片标题 =====
H.CASES = [
  { id: 'a1', expect: '姓名' },
  { id: 'a2', expect: '手机号码' },
  { id: 'a3', expect: '毕业院校' },
  { id: 'a4', expect: '是否服从调剂' },
  { id: 'b1', expect: '身份证号码' },
  { id: 'b2', expect: '政治面貌' },
  { id: 'b3', expect: '所学专业' },
  { id: 'c1', expect: '电子邮箱' },
  { id: 'c2', expect: '紧急联系人电话' },
  { id: 'c3', expect: null, allowAny: false },  // 纯计数标签：必须"未识别"，不许显示 "0/200"
  { id: 'd1', expect: '姓名' },
  { id: 'd2', expect: null, allowAny: true },  // 概念表无"关系"：读到真标签或未识别都算合格
  { id: 'd3', expect: '联系电话' },
  { id: 'd4', expect: '学校名称' },
  { id: 'e1', expect: '民族' },
  { id: 'e2', expect: '籍贯' },
  { id: 'f1', expect: null, allowAny: false }, // 真无标签：必须"未识别"
  { id: 'f2', expect: '验证码' },               // "请输入验证码" 需剥壳
  { id: 'g1', expect: null, allowAny: true },  // 概念表无"英语水平"
];

H.runLabels = async function runLabels() {
  const out = [];
  for (const cs of H.CASES) {
    const card = await H.focus(cs.id);
    const t = card.title || '';
    const shown = t || '未识别';
    const genericLeak = /^请输入|^请选择|^请填写|^填入/.test(t);
    const bareId = /^[A-Za-z]{1,3}\d{0,3}$/.test(t);   // a4 / b2 / f1 这类裸 id
    const counterLeak = /^[\d\s/]+$/.test(t);            // 0/200
    let ok;
    if (cs.expect === null) {
      // 无概念可归的字段：读到"真标签"或"未识别"都算合格；裸 id / 占位符 / 计数 不合格
      ok = !genericLeak && !bareId && !counterLeak && (cs.allowAny || t === '' || t === '未识别');
    } else {
      ok = t.includes(cs.expect) && !bareId;
    }
    out.push({ id: cs.id, expect: cs.expect, got: shown, n: card.rows.length,
      genericLeak, bareId, ok, rows: card.rows.map((r) => r.txt) });
  }
  return out;
};

// 写入验证：点候选 → 回读输入框值 → 看 toast 是否诚实
H.runWrites = async function runWrites() {
  const out = [];

  // W1 普通文本框：应真的写入 + toast 说已填入
  await H.focus('a1');
  const c1 = await H.clickRow(0);
  const v1 = document.getElementById('a1').value;
  out.push({ name: 'W1 普通写入', value: v1, toast: c1.toast, ok: v1 === '张三' && /已填入/.test(c1.toast) });

  // W2 被页面截断（模拟 maxlength/格式化）：toast 必须提示被改写，不许谎报成功
  const a2 = document.getElementById('a2');
  a2.addEventListener('input', () => { a2.value = a2.value.replace(/\D/g, '').slice(0, 5); });
  await H.focus('a2');
  const c2 = await H.clickRow(0);
  const v2 = a2.value;
  out.push({ name: 'W2 被页面截断', value: v2, toast: c2.toast,
    ok: v2 !== '138xxxx0000' && /改写|未生效|核对|请核对/.test(c2.toast) });

  // W3 被页面整体还原（change 时清空）：toast 必须报"未生效"
  const a3 = document.getElementById('a3');
  a3.addEventListener('change', () => { a3.value = ''; });
  await H.focus('a3');
  const c3 = await H.clickRow(0);
  const v3 = a3.value;
  out.push({ name: 'W3 写入被还原', value: v3, toast: c3.toast,
    ok: v3 === '' && /未生效|还原|手动/.test(c3.toast) });

  // W4 select 精确唯一匹配：应填入共青团员（字典 politics = 共青团员）
  await H.focus('g2');
  const c4 = await H.clickRow(0);
  const v4 = document.getElementById('g2').value;
  out.push({ name: 'W4 select 精确命中', value: v4, toast: c4.toast, ok: v4 === '共青团员' });

  return out;
};

// select 歧义专项：字典里存 "英语"（custom），选项有 英语四级/六级/专八
H.runSelectAmbiguity = async function runSelectAmbiguity() {
  const store = window.__store();
  const d = store.wsa_dict_v2;
  if (!d.custom.some((x) => x.label === '英语水平')) {
    d.custom.push({ label: '英语水平', aliases: ['英语水平', '英语'], options: [{ value: '英语', tag: '' }] });
    await new Promise((r) => chrome.storage.local.set({ wsa_dict_v2: d }, () => setTimeout(r, 60)));
  }
  await H.tick(80);
  const card = await H.focus('g1');
  const before = document.getElementById('g1').value;
  let after = before, toast = '', clicked = false;
  if (card.rows.length) { const c = await H.clickRow(0); after = document.getElementById('g1').value; toast = c.toast; clicked = true; }
  return {
    candidates: card.rows.map((r) => r.txt), before, after, toast, clicked,
    // 期望：要么不自动填（保持空）并在 toast 说明，要么填了但 toast 明确提示歧义并列出可选值
    ok: after === '' ? /无法|请手动|多个|歧义/.test(toast) : /歧义|多个|四级|六级|专八/.test(toast),
  };
};

H.runAll = async function runAll(bundleText) {
  const lines = [];
  await H.inject(bundleText);
  const labels = await H.runLabels();
  const nOk = labels.filter((x) => x.ok).length;
  lines.push('===== 标签识别 ' + nOk + '/' + labels.length + ' =====');
  for (const r of labels) {
    lines.push((r.ok ? '  OK   ' : '  FAIL ') + r.id.padEnd(4) + ' 期望=' + String(r.expect).padEnd(12) +
      ' 实得=' + String(r.got).padEnd(16) + ' 候选=' + r.n + (r.genericLeak ? ' [占位符泄漏]' : '') +
      (r.rows.length ? ' :: ' + r.rows.join(' | ').slice(0, 70) : ''));
  }
  const writes = await H.runWrites();
  const wOk = writes.filter((x) => x.ok).length;
  lines.push('');
  lines.push('===== 写入诚实性 ' + wOk + '/' + writes.length + ' =====');
  for (const w of writes) lines.push((w.ok ? '  OK   ' : '  FAIL ') + w.name + ' 值=[' + w.value + '] toast=[' + w.toast + ']');
  const sa = await H.runSelectAmbiguity();
  lines.push('');
  lines.push('===== select 歧义 ' + (sa.ok ? 'OK' : 'FAIL') + ' =====');
  lines.push('  候选=' + JSON.stringify(sa.candidates) + ' 填后值=[' + sa.after + '] toast=[' + sa.toast + ']');
  const sf = await H.runSafety();
  const sOk = sf.filter((x) => x.ok).length;
  lines.push('');
  lines.push('===== 危险场景 ' + sOk + '/' + sf.length + ' =====');
  for (const s of sf) lines.push((s.ok ? '  OK   ' : '  FAIL ') + s.name + ' 标题=[' + s.title + '] 候选=' +
    JSON.stringify(s.rows) + ' — ' + s.note);
  return lines.join('\n');
};

// 危险场景：高分概念本身没有候选时，绝不能把"低分但无关"概念的候选顶上来。
// 典型：字典里没有紧急联系人电话，若把本人手机号列出来，用户会误填自己的号码当紧急联系人。
H.runSafety = async function runSafety() {
  const out = [];
  const d0 = window.__store().wsa_dict_v2;

  // S1 紧急联系人电话：清空 emergency，观察是否还列 phone（本人手机号）
  d0.concepts.emergency.options = [];
  d0.concepts.phone.options = [{ value: '138xxxx0000', tag: '' }];
  await new Promise((r) => chrome.storage.local.set({ wsa_dict_v2: d0 }, () => setTimeout(r, 60)));
  await H.tick(60);
  const c1 = await H.focus('c2');
  const leak1 = c1.rows.some((r) => r.txt.includes('138xxxx0000'));
  out.push({ name: 'S1 紧急联系人电话不列本人手机号', rows: c1.rows.map((r) => r.txt), title: c1.title,
    ok: !leak1, note: leak1 ? '把本人手机号列进了紧急联系人框' : '已抑制' });

  // S2 身份证号码框：不应捎带列出手机号候选（号码 ⊂ 身份证号码 属过度匹配）
  const c2 = await H.focus('b1');
  const leak2 = c2.rows.some((r) => r.txt.includes('138xxxx0000'));
  out.push({ name: 'S2 身份证框不捎带手机号', rows: c2.rows.map((r) => r.txt), title: c2.title,
    ok: !leak2, note: leak2 ? '身份证框混入手机号候选' : '已抑制' });

  // S3 反向确认没修过头：联系电话（"电话"==整串）必须仍然命中手机号
  const c3 = await H.focus('d3');
  const still = c3.rows.some((r) => r.txt.includes('138xxxx0000'));
  out.push({ name: 'S3 联系电话仍命中手机号（未修过头）', rows: c3.rows.map((r) => r.txt), title: c3.title,
    ok: still, note: still ? '正常' : '把正常命中一起抑掉了' });

  return out;
};

// ===== 按钮接线 =====
(async () => {
  async function bundle() {
    const parts = ['../data.js', '../matcher.js', '../content.js'];
    const bust = '?t=' + Date.now();
    const texts = await Promise.all(parts.map((p) => fetch(p + bust).then((r) => {
      if (!r.ok) throw new Error('fetch ' + p + ' ' + r.status);
      return r.text();
    })));
    return texts.join('\n;\n');
  }
  document.getElementById('inject').addEventListener('click', async () => {
    try { await H.inject(await bundle()); } catch (e) { document.getElementById('res').textContent = 'ERR ' + e.message; }
  });
  document.getElementById('runall').addEventListener('click', async () => {
    try { document.getElementById('res').textContent = await H.runAll(await bundle()); }
    catch (e) { document.getElementById('res').textContent = 'ERR ' + (e && e.stack || e); }
  });
  document.getElementById('clr').addEventListener('click', () => {
    const h = document.getElementById(HOSTID()); if (h) h.remove();
    delete window.__wsaInjected; document.getElementById('status').textContent = '已清除';
  });
  document.getElementById('status').textContent = '就绪，点"注入"或"跑全部用例"';
})();
