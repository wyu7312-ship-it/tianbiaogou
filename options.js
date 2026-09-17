// 填表狗 · 字典管理（存储 v2：按概念归位；零联网——本页及所加载脚本无任何外发通道）
let dict = null;      // {version:2, concepts:{id:{userAliases:[],options:[{value,tag}]}}, custom:[{label,aliases,options}]}
let showEmpty = false;

function status(msg, warn) {
  const s = document.getElementById('status');
  s.textContent = msg;
  s.style.color = warn ? '#c0392b' : '#1a7f37';
  setTimeout(() => { if (s.textContent === msg) s.textContent = ''; }, 3000);
}

// 补全概念骨架：手写/导入的数据可能缺槽位，统一补齐后再操作
function skeleton(v2) {
  v2.concepts = v2.concepts || {};
  v2.custom = v2.custom || [];
  for (const c of window.WSA_CONCEPTS) {
    const s = v2.concepts[c.id] || {};
    v2.concepts[c.id] = {
      userAliases: Array.isArray(s.userAliases) ? s.userAliases : [],
      options: Array.isArray(s.options) ? s.options : [],
    };
  }
  v2.version = 2;
  return v2;
}

function slotFilled(s) {
  return (s.options || []).some((o) => o && String(o.value || '').trim()) || (s.userAliases || []).length > 0;
}
function isEmptyDict(d) {
  if (!d) return true;
  if ((d.custom || []).some((e) => (e.options || []).some((o) => o && String(o.value || '').trim()))) return false;
  for (const id in (d.concepts || {})) if (slotFilled(d.concepts[id])) return false;
  return true;
}

// 保存前清洗：改用 matcher.js 的共享实现，保证与 content.js「记住」路径产出一致
function cleanDict(d) { return WSA.cleanDict(d, window.WSA_CONCEPTS); }
function persist(cb) {
  dict = cleanDict(dict);
  chrome.storage.local.set({ wsa_dict_v2: dict }, cb || null);
}

// ---------- 编辑区 ----------
function buildOptRows(card, owner) {
  owner.options = owner.options || [];
  owner.options.forEach((o, oi) => {
    const row = document.createElement('div'); row.className = 'opt';
    const lv = document.createElement('label'); lv.textContent = '候选值';
    const v = document.createElement('textarea'); v.className = 'v'; v.value = o.value || '';
    v.addEventListener('input', () => { o.value = v.value; });
    const lt = document.createElement('label'); lt.textContent = '标签';
    const t = document.createElement('input'); t.type = 'text'; t.className = 't'; t.value = o.tag || '';
    t.placeholder = '如：母亲/紧急联系人，可空';
    t.addEventListener('input', () => { o.tag = t.value; });
    const x = document.createElement('button'); x.className = 'danger'; x.textContent = '×';
    x.addEventListener('click', () => { owner.options.splice(oi, 1); render(); });
    row.append(lv, v, lt, t, x);
    card.appendChild(row);
  });
  const addOpt = document.createElement('button'); addOpt.textContent = '＋ 加一个候选值'; addOpt.style.marginTop = '8px';
  addOpt.addEventListener('click', () => { owner.options.push({ value: '', tag: '' }); render(); });
  card.appendChild(addOpt);
}

function aliasInput(target) {
  const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'aliases';
  inp.value = (target.userAliases || target.aliases || []).join('，');
  inp.placeholder = '逗号分隔，如：移动号码，联系电话';
  inp.addEventListener('input', () => {
    const arr = inp.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    if (target.userAliases) target.userAliases = arr; else target.aliases = arr;
  });
  return inp;
}

function conceptCard(c) {
  const slot = dict.concepts[c.id];
  const card = document.createElement('div'); card.className = 'card' + (slotFilled(slot) ? '' : ' dim');
  const top = document.createElement('div'); top.className = 'top';
  const nm = document.createElement('span'); nm.className = 'cname'; nm.textContent = c.label;
  const chip = document.createElement('span'); chip.className = 'chip';
  chip.textContent = c.zh.slice(0, 3).join('/') + (c.en.length ? ' · ' + c.en.slice(0, 2).join('/') : '');
  top.append(nm, chip);
  if (c.person) { const pc = document.createElement('span'); pc.className = 'chip'; pc.textContent = '支持 母亲/父亲/紧急联系人…'; top.appendChild(pc); }
  const la = document.createElement('label'); la.textContent = '别名';
  top.append(la, aliasInput(slot));
  card.appendChild(top);
  buildOptRows(card, slot);
  return card;
}

function customCard(e, ci) {
  const card = document.createElement('div'); card.className = 'card';
  const top = document.createElement('div'); top.className = 'top';
  const lbl = document.createElement('label'); lbl.textContent = '字段';
  const name = document.createElement('input'); name.type = 'text'; name.className = 'aliases';
  name.style.maxWidth = '220px'; name.value = e.label || ''; name.placeholder = '字段标签（网站上的叫法）';
  name.addEventListener('input', () => { e.label = name.value; });
  const chip = document.createElement('span'); chip.className = 'chip custom'; chip.textContent = '自定义';
  const la = document.createElement('label'); la.textContent = '别名';
  const del = document.createElement('button'); del.className = 'danger del'; del.textContent = '删除字段';
  del.addEventListener('click', () => { dict.custom.splice(ci, 1); render(); });
  top.append(lbl, name, chip, la, aliasInput(e), del);
  card.appendChild(top);
  buildOptRows(card, e);
  return card;
}

function render() {
  const list = document.getElementById('list');
  list.innerHTML = '';
  const filled = [], empty = [];
  for (const c of window.WSA_CONCEPTS) (slotFilled(dict.concepts[c.id]) ? filled : empty).push(c);
  for (const c of filled) list.appendChild(conceptCard(c));
  dict.custom.forEach((e, ci) => list.appendChild(customCard(e, ci)));
  if (showEmpty) for (const c of empty) list.appendChild(conceptCard(c));
  document.getElementById('toggleEmpty').textContent =
    showEmpty ? '收起空概念' : '展开空概念（' + empty.length + '）';
}

// ---------- 首启向导（占位符一律假名，AGENTS.md §一） ----------
const WIZ_PH = { name: '张三', phone: '138xxxx0000', email: 'you@example.com', school: '某某大学', major: '某某专业' };
function renderWizard() {
  const box = document.getElementById('wizard');
  if (!isEmptyDict(dict)) { box.hidden = true; return; }
  box.hidden = false;
  const ol = document.getElementById('wizlist');
  ol.innerHTML = '';
  for (const f of WSA.wizardFields()) {
    const li = document.createElement('li');
    const lab = document.createElement('label');
    lab.appendChild(document.createTextNode(f.label + ' '));
    if (f.secret) { const sec = document.createElement('span'); sec.className = 'sec'; sec.textContent = '（选填·只存本机）'; lab.appendChild(sec); }
    lab.appendChild(document.createElement('br'));
    const inp = document.createElement('input'); inp.type = 'text'; inp.dataset.id = f.id;
    inp.placeholder = WIZ_PH[f.id] || '';
    lab.appendChild(inp);
    if (f.person) {
      lab.appendChild(document.createTextNode(' '));
      const sel = document.createElement('select'); sel.dataset.scopeFor = f.id;
      for (const t of ['本人', '母亲', '父亲', '配偶', '紧急联系人']) {
        const op = document.createElement('option'); op.textContent = t; sel.appendChild(op);
      }
      lab.appendChild(sel);
    }
    li.appendChild(lab); ol.appendChild(li);
  }
}

document.getElementById('wizform').addEventListener('submit', (e) => {
  e.preventDefault();
  let n = 0;
  for (const inp of document.querySelectorAll('#wizlist input[data-id]')) {
    const value = inp.value.trim();
    if (!value) continue;
    const id = inp.dataset.id;
    const c = window.WSA_CONCEPTS.find((x) => x.id === id);
    const sel = document.querySelector('#wizlist select[data-scope-for="' + id + '"]');
    const scope = sel ? sel.value : '';
    const tag = (c && c.person && scope && scope !== '本人') ? scope : '';
    const slot = dict.concepts[id];
    if (!slot.options.some((o) => o.value === value && (o.tag || '') === tag)) { slot.options.push({ value, tag }); n++; }
  }
  if (!n) { status('什么都没填：写点信息再保存，或点「跳过，边用边记」', true); return; }
  persist(() => { render(); renderWizard(); status('已保存 ' + n + ' 条 → 只存在本机 ✔'); });
});
document.getElementById('wizskip').addEventListener('click', () => {
  document.getElementById('wizard').hidden = true;
});

// ---------- 按钮 ----------
document.getElementById('save').addEventListener('click', () => {
  persist(() => { render(); renderWizard(); status('已保存'); });
});
document.getElementById('addField').addEventListener('click', () => {
  dict.custom.unshift({ label: '', aliases: [], options: [{ value: '', tag: '' }] });
  render();
  const first = document.querySelector('#list input[placeholder^="字段标签"]');
  if (first) first.focus();
});
document.getElementById('toggleEmpty').addEventListener('click', () => { showEmpty = !showEmpty; render(); });
document.getElementById('wipe').addEventListener('click', () => {
  if (!confirm('将删除本机保存的全部字典（含所有别名与候选），不可恢复。\n导出备份了吗？未备份请先「取消」，点「导入/导出」保存副本到 private/ 目录。')) return;
  if (!confirm('再次确认：真的清空？清空后回到首次使用状态（向导会重新出现）。')) return;
  chrome.storage.local.remove(['wsa_dict_v2'], () => {
    dict = WSA.seedV2(); render(); renderWizard(); status('本机字典已清空');
  });
});
document.getElementById('toggleIO').addEventListener('click', () => {
  const box = document.getElementById('ioBox');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('doExport').addEventListener('click', () => {
  document.getElementById('ioText').value = JSON.stringify(dict, null, 2);
  status('已填入文本框——备份含个人信息，只存 private/ 目录，勿上传');
});
document.getElementById('doImport').addEventListener('click', () => {
  try {
    const parsed = JSON.parse(document.getElementById('ioText').value);
    if (Array.isArray(parsed)) dict = skeleton(WSA.migrateV1(parsed, window.WSA_CONCEPTS));
    else if (parsed && parsed.version === 2) dict = skeleton(parsed);
    else throw new Error('既不是 v1 数组也不是 version:2 对象');
    persist(() => { render(); renderWizard(); status('导入成功并已保存'); });
  } catch (err) { status('导入失败：' + err.message, true); }
});

// ---------- 加载（与 content.js ensureDict 同一套协议） ----------
chrome.storage.local.get(['wsa_dict_v2', 'wsa_dict'], (res) => {
  const v2 = res && res.wsa_dict_v2;
  if (v2 && v2.concepts) dict = skeleton(v2);
  else if (res && Array.isArray(res.wsa_dict) && res.wsa_dict.length) {
    dict = skeleton(WSA.migrateV1(res.wsa_dict, window.WSA_CONCEPTS));
    chrome.storage.local.set({ wsa_dict_v2: dict, wsa_dict_backup_v1: res.wsa_dict });
  } else dict = WSA.seedV2();
  render(); renderWizard();
});
