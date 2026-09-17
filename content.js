// 网申填充助手 · content script
// 交互：点中输入框 → 旁边弹出候选卡片 → 点选/回车填入该框（只填这一个框）
// 原则：永远不批量填、不自动提交；填完的框需人工过目
(() => {
  'use strict';
  if (window.__wsaInjected) return;
  window.__wsaInjected = true;

  const STYLE = `
  .panel{position:fixed;z-index:2147483000;background:#fff;border:1px solid #d0d7de;border-radius:10px;
    box-shadow:0 8px 24px rgba(0,0,0,.18);font:13px/1.5 -apple-system,"Microsoft YaHei","PingFang SC",sans-serif;color:#1a1a1a;overflow:hidden}
  .head{padding:6px 10px;font-size:12px;color:#57606a;border-bottom:1px solid #f0f2f4;display:flex;justify-content:space-between;gap:10px;cursor:move;user-select:none}
  .head .grip{color:#b6c0cc;letter-spacing:-1px}
  .head .box{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .body{max-height:300px;overflow:auto;padding:4px}
  .row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer}
  .row:hover,.row.sel{background:#eef4ff}
  .val{flex:1;word-break:break-all}
  .tag{font-size:11px;color:#8a5a00;background:#fff4d6;border-radius:4px;padding:1px 6px;margin-left:8px;white-space:nowrap;flex-shrink:0}
  .src{font-size:11px;color:#8896a6;margin-right:6px;flex-shrink:0}
  .hint{padding:8px;color:#8896a6;font-size:12px;word-break:break-all}
  .row.add{color:#1a7f37;font-weight:600;justify-content:flex-start}
  .foot{display:flex;justify-content:space-between;align-items:center;padding:5px 10px;border-top:1px solid #f0f2f4;font-size:11px;color:#8896a6}
  .foot a{color:#3b6fd4;cursor:pointer;text-decoration:none}
  .toast{padding:6px 10px;font-size:12px;color:#1a7f37;background:#f0fff4;border-top:1px solid #d6f5dd;word-break:break-all}
  .toast.warn{color:#9a3b00;background:#fff8ef;border-top-color:#ffe3c2}`;

  let dict = null;
  let host = null, shadow = null, panel = null;
  let toastTimer = null;
  const state = { el: null, hay: [], rows: [], sel: -1, manual: null };

  // 存储协议 v2：wsa_dict_v2；存在旧 wsa_dict(v1数组) 则自动迁移并留备份；皆无则装空种子
  function ensureDict() {
    chrome.storage.local.get(['wsa_dict_v2', 'wsa_dict'], (res) => {
      let v2 = res && res.wsa_dict_v2;
      function afterSet() { dict = v2; if (state.el && document.activeElement === state.el) render(); }
      if (v2 && v2.concepts) { dict = v2; return; }
      if (res && Array.isArray(res.wsa_dict) && res.wsa_dict.length) {
        v2 = WSA.migrateV1(res.wsa_dict, window.WSA_CONCEPTS);
        chrome.storage.local.set({ wsa_dict_v2: v2, wsa_dict_backup_v1: res.wsa_dict }, afterSet);
      } else {
        v2 = WSA.seedV2(); // 永远以概念骨架打底，防 remember 访问空槽崩溃
        const base = (window.WSA_DEFAULTS && window.WSA_DEFAULTS.version === 2) ? window.WSA_DEFAULTS : null;
        if (base) { // 数据文件如带预置字典（公开版为空），合并进骨架
          for (const id in (base.concepts || {})) {
            const src = base.concepts[id], dst = v2.concepts[id];
            if (dst && src) {
              if (Array.isArray(src.userAliases)) dst.userAliases = src.userAliases.slice();
              if (Array.isArray(src.options)) dst.options = src.options.slice();
            }
          }
          if (Array.isArray(base.custom)) v2.custom = JSON.parse(JSON.stringify(base.custom));
        }
        chrome.storage.local.set({ wsa_dict_v2: v2 }, afterSet);
      }
    });
  }
  ensureDict();
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.wsa_dict_v2) {
      dict = ch.wsa_dict_v2.newValue;
      if (state.el && panelVisible()) render();
    }
  });

  // ---------- 识别 ----------
  function isEditable(el) {
    if (!el || !el.tagName) return false;
    const t = el.tagName;
    if (t === 'TEXTAREA') return !el.disabled;
    if (t === 'SELECT') return !el.disabled;
    if (t === 'INPUT') {
      if (el.disabled) return false;
      const type = (el.type || 'text').toLowerCase();
      return ['text', 'search', 'tel', 'email', 'url', 'number'].includes(type);
    }
    return false;
  }

  function textOf(node) { return ((node && node.textContent) || '').replace(/\s+/g, ' ').trim(); }

  const norm = WSA.norm; // 归一化统一用 matcher.js 实现，避免两份漂移（后续函数都依赖它）

  // ---------- 标签采集与甄别（v0.4） ----------
  // 告警/校验/提示类 class 不是标签
  const HINT_CLASS = /(^|[\s_-])(err|error|errors|invalid|danger|warn|warning|help|hint|tip|tips|note|msg|message|feedback|placeholder|desc|description|extra|count|counter|required|star|asterisk)([\s_-]|$)/i;

  // 纯计数/纯符号/纯数字噪声（"0/200"、"*"、"--"）
  function isNoise(s) {
    const t = String(s || '').trim();
    if (!t) return true;
    if (!/[一-龥a-zA-Z]/.test(t)) return true;
    return /^[\d\s/|·.,，、:：*＊()（）\[\]【】-]+$/.test(t);
  }

  // 无信息占位符："请输入/请选择/必填"等——绝不能拿来当卡片标题
  function isGenericHint(s) {
    const t = norm(s);
    if (!t) return true;
    if (t === '必填' || t === '选填' || t === '其他' || t === '请选择' || t === '请输入') return true;
    if (/^(请)?(输入|选择|填写|填入|写)(内容|信息|一下|吧)?$/.test(t)) return true;
    return false;
  }

  // 剥掉"请输入/请选择"动词壳（"请输入验证码" → "验证码"）
  function stripVerb(s) {
    return String(s || '')
      .replace(/^[\s*＊]*(请)?(输入|填写|填入|选择|录入|上传)\s*/, '')
      .replace(/[\s*＊:：]+$/, '')
      .trim();
  }

  // 表单里的告警/校验文案（"邮箱格式不正确"）不是标签
  function looksLikeValidation(t) {
    return /(不正确|不合法|格式|有误|错误|失败|不能为空|不得为空|请填写|请先|请输入|请选择|必填|必选|太长|超长|无效)/.test(String(t || ''));
  }

  // "可见且可编辑"的控件才算另一个字段（hidden/disabled/不可见都不算）
  function isVisibleControl(n) {
    const t = (n.type || '').toLowerCase();
    if (t === 'hidden' || n.disabled) return false;
    if (n.offsetParent !== null) return true;
    try { if (n.getClientRects().length) return true; } catch (e) {}
    return false;
  }

  // 近似"可输入文本"的控件类型：只有这类控件才说明兄弟是"另一个字段"
  const TEXTY_TYPES = ['', 'text', 'search', 'tel', 'email', 'url', 'number', 'password'];

  // 兄弟元素是否"本身就是另一个字段的输入位"。
  // 关键：只把"可输入文本的可见控件"当作另一个字段——
  //   含 hidden 的（<div class="label">政治面貌<input type=hidden></div>）是标签；
  //   含 select 的（<div class="label">所学专业<select>…</select></div>）也是标签，
  //   因为国内网申大量"专业/学校用下拉选"，把这种整块跳过会直接丢掉标签。
  function siblingHasField(ps) {
    const isTexty = (c) => {
      const t = (c.type || '').toLowerCase();
      return TEXTY_TYPES.includes(t) && isVisibleControl(c);
    };
    if (ps.matches && ps.matches('input,textarea')) return isTexty(ps);
    if (ps.matches && ps.matches('select')) return false;          // select 常与标签同容器
    const list = ps.querySelectorAll ? ps.querySelectorAll('input,textarea') : [];
    for (const c of list) if (isTexty(c)) return true;
    return false;
  }

  // 采集标签候选（带来源与可信度；同分以"更短更具体"胜出）
  function collectCandidates(el) {
    const cands = [];
    const push = (s, why, score) => {
      s = String(s || '').replace(/\s+/g, ' ').trim().replace(/^[*＊\s]+/, '').replace(/[\s*＊:：]+$/, '');
      if (!s || s.length > 40) return;
      let v = stripVerb(s) || s;
      v = v.replace(/[\s*＊:：]+$/, '');
      // 去掉"必填/选填"这类纯标记尾巴（"紧急联系人电话必填" → "紧急联系人电话"）；
      // 若去掉后什么都不剩，说明整串只是标记，丢弃
      const stripped = v.replace(/(必填|选填|必选|选填项|required)$/i, '').replace(/[\s*＊:：]+$/, '').trim();
      if (!stripped) return;
      v = stripped;
      if (!v || isNoise(v) || isGenericHint(v) || looksLikeValidation(v)) return;
      cands.push({ s: v, why, score });
    };

    if (el.getAttribute) push(el.getAttribute('aria-label'), 'aria', 80);
    if (el.placeholder) push(el.placeholder, 'placeholder', 40);
    if (el.title) push(el.title, 'title', 55);
    if (el.name) push(el.name, 'name', 45);

    if (el.id) {
      let lab; try { lab = document.querySelector('label[for=' + CSS.escape(el.id) + ']'); } catch (e) { lab = null; }
      if (lab) push(textOf(lab), 'label[for]', 95);
    }
    const wrap = el.closest && el.closest('label');
    if (wrap) push(textOf(wrap), 'closest(label)', 90);

    // 旁支兄弟标签：ATS/组件库（zhiye/phoenix 等）常把标签做成与"控件容器"并列的兄弟元素
    let branch = el.parentElement, up = branch ? branch.parentElement : null;
    for (let i = 0; i < 5 && up; i++, branch = up, up = up.parentElement) {
      for (let ps = branch.previousElementSibling, j = 0; j < 2 && ps; j++, ps = ps.previousElementSibling) {
        if (siblingHasField(ps)) continue;
        if (ps.classList && HINT_CLASS.test(String(ps.className || ''))) continue;
        const t = textOf(ps);
        if (t && t.length <= 24) push(t, 'branchScan(L' + i + ')', 75 - i * 3);
      }
    }

    // 表格布局：td 的前兄弟常常就是标签
    const td = el.closest && el.closest('td');
    if (td) {
      const p = td.previousElementSibling;
      if (p && !(p.classList && HINT_CLASS.test(String(p.className || '')))) push(textOf(p), 'td.prevSib', 70);
    }

    // fieldset/legend 分组名（弱来源）
    const fs = el.closest && el.closest('fieldset');
    if (fs) { const lg = fs.querySelector('legend'); if (lg) push(textOf(lg), 'legend', 50); }

    // 紧邻前兄弟（校验文案已被 HINT_CLASS / looksLikeValidation 过滤）
    let sib = el.previousElementSibling;
    for (let i = 0; i < 2 && sib; i++, sib = sib.previousElementSibling) {
      if (sib.classList && HINT_CLASS.test(String(sib.className || ''))) continue;
      push(textOf(sib), 'prevSib' + i, 30 - i * 5);
    }

    // 祖先自身的直接文本节点（最弱来源，放最后）
    let anc = el.parentElement;
    for (let i = 0; i < 3 && anc; i++, anc = anc.parentElement) {
      let own = '';
      for (const n of anc.childNodes) if (n.nodeType === 3) own += n.textContent;
      if (own.trim()) push(own.trim(), 'ancText' + i, 20 - i * 5);
    }
    return cands;
  }

  // 兼容层：haystack 仍是"字符串数组"（供 WSA.matchConcepts/buildRows/detectQualifier 使用）。
  // 按可信度排序 → 高可信标签在前 → matchConcepts 取 hits[0] 时天然优先真标签。
  function haystack(el) {
    const cands = collectCandidates(el);
    cands.sort((a, b) => b.score - a.score);
    const seen = new Set();
    const parts = [];
    for (const c of cands) {
      if (seen.has(c.s)) continue;
      seen.add(c.s);
      parts.push(c.s);
      if (parts.length >= 8) break;
    }
    if (!parts.length && el.id) {
      const idGuess = String(el.id).replace(/[_-]+/g, ' ');
      if (/^[A-Za-z][A-Za-z0-9 ]*$/.test(idGuess)) parts.push(idGuess); // 仅兜底，firstLabel 仍挡住裸 id
    }
    return parts;
  }

  // 卡片标题：优先可信度最高的中文标签；全英文 → 退到第一个像样的英文标签；都没有 → "未识别"
  function firstLabelFrom(cands) {
    const ok = cands.filter((c) => !isGenericHint(c.s) && !isNoise(c.s) && !looksLikeValidation(c.s));
    const cn = ok.filter((c) => /[一-龥]/.test(c.s));
    const en = ok.filter((c) => /[A-Za-z]/.test(c.s) && !/^[A-Za-z0-9 _-]{1,24}$/.test(c.s));
    const pick = cn.length ? cn : en;
    if (!pick.length) return '';
    pick.sort((a, b) => (b.score - a.score) || (a.s.length - b.s.length));
    return pick[0].s.replace(/[:：*＊\s]+$/g, '').slice(0, 20);
  }

  function firstLabel(hay) {
    // 兼容旧签名：hay 已按可信度排序，下标越靠前越可信
    return firstLabelFrom(hay.map((s, i) => ({ s: String(s), score: 1000 - i * 10, why: 'hay' })));
  }

  // ---------- 写入 ----------
  // 写入后一律回读核对：区分"真写入 / 被页面改写 / 未生效"三态，
  // 绝不无条件报"已填入"——这是本扩展"填完请目检"承诺的前提。
  function readBack(el, want) {
    const got = el.value;
    if (got === want) return { state: 'ok', got };
    if (got === '' || got == null) return { state: 'reverted', got: '' };
    return { state: 'changed', got: String(got) };
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (!desc || !desc.set) return { ok: false, state: 'unsupported', got: '' };
    desc.set.call(el, value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const rb = readBack(el, value);
    return { ok: rb.state === 'ok', state: rb.state, got: rb.got };
  }

  // select 取值：只做"精确归一化唯一命中"或"部分匹配唯一命中"；
  // 部分匹配命中多项时算歧义——照填第一个，但必须把选项列给用户核对（不许静默选错）。
  function resolveSelectOption(el, value) {
    const nv = norm(value);
    const opts = Array.from(el.options).filter((o) => o.value !== '');
    if (!nv) return { kind: 'none' };
    const exact = opts.filter((x) => norm(x.text) === nv);
    if (exact.length) return { kind: 'exact', option: exact[0] };
    const part = opts.filter((x) => norm(x.text).includes(nv) || (nv.length >= 2 && nv.includes(norm(x.text))));
    if (part.length === 1) return { kind: 'unique', option: part[0] };
    if (part.length > 1) return { kind: 'ambiguous', option: part[0], candidates: part.map((x) => x.text) };
    return { kind: 'none' };
  }

  function setSelect(el, value) {
    const r = resolveSelectOption(el, value);
    if (!r.option) return { ok: false, state: 'nomatch', kind: r.kind };
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(el, r.option.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const chosen = el.options[el.selectedIndex];
    return {
      ok: true, kind: r.kind, candidates: r.candidates || [],
      got: chosen ? chosen.text : '',
      label: chosen ? chosen.text : '',
    };
  }

  function fill(row) {
    const el = state.el;
    if (!el) return;
    const value = row.value;
    const tag = (row.weak ? '≈' : '') + row.label + (row.tag ? '·' + row.tag : '');
    let r;
    try { r = el.tagName === 'SELECT' ? setSelect(el, value) : setNativeValue(el, value); }
    catch (e) { r = { ok: false, state: 'error' }; }

    if (r.kind === 'ambiguous') {
      toast('已填入「' + tag + '」→ 实际选中「' + r.got + '」，但选项有多个相近值（' +
        r.candidates.join(' / ') + '），请务必核对', true);
      return;
    }
    if (r.kind === 'nomatch') {
      toast('该下拉框里没有匹配「' + value + '」的选项，请手动选择', true);
      return;
    }
    if (r.state === 'ok') { toast('已填入「' + tag + '」→ 请目检该框内容'); return; }
    if (r.state === 'changed') {
      toast('已填入，但被页面改写为「' + r.got + '」（原文「' + value + '」），请核对该框', true);
      return;
    }
    if (r.state === 'reverted') {
      toast('填入未生效（页面已还原该框），请手动输入', true);
      return;
    }
    toast('无法自动填入此框（可能是不支持控件），请手动输入', true);
  }

  // 记住：先跑概念匹配自动归位（值→概念options，新标签→userAliases，限定词→tag）；命不中才独立成 custom 条
  // 写入协议：读改写（get → 合并 → 清洗 → set），避免与"字典管理"页并发保存时互相覆盖
  function persistDict(done) {
    chrome.storage.local.get(['wsa_dict_v2'], (res) => {
      const cur = (res && res.wsa_dict_v2 && res.wsa_dict_v2.concepts) ? res.wsa_dict_v2
        : (dict && dict.concepts ? dict : WSA.seedV2());
      try { done(cur); } catch (e) {}
      const clean = WSA.cleanDict ? WSA.cleanDict(cur, window.WSA_CONCEPTS) : cur;
      dict = clean;
      chrome.storage.local.set({ wsa_dict_v2: clean });
    });
  }

  function remember() {
    const el = state.el, value = el && el.value;
    if (!value) { toast('请先在该框输入内容，再点「记住」', true); return; }
    const hits = dict ? WSA.matchConcepts(state.hay, dict) : [];
    const scope = WSA.detectQualifier(state.hay);
    const rawLabel = firstLabel(state.hay);
    // 标签不可用时拒绝入库：否则会存成 "a4"/"请输入" 这类垃圾键，永久污染字典且再也匹配不上
    if (!rawLabel || isGenericHint(rawLabel) || isNoise(rawLabel) || looksLikeValidation(rawLabel)) {
      toast('未识别出该框标签，已取消保存——请到「字典管理」页手动添加字段名', true);
      return;
    }
    persistDict((cur) => {
      const hits2 = WSA.matchConcepts(state.hay, cur);
      if (hits2.length) {
        const c = hits2[0].concept;
        if (c.custom) {
          if (!c.custom.options.some((o) => o.value === value)) c.custom.options.push({ value, tag: scope || '' });
          toast('已记住 → 归入「' + c.label + '」' + (scope ? '·' + scope : '') + ' ✔');
        } else {
          const slot = cur.concepts[c.id] || (cur.concepts[c.id] = { userAliases: [], options: [] });
          if (rawLabel && !slot.userAliases.includes(rawLabel)
              && !c.zh.concat(c.en).some((w) => norm(w) === norm(rawLabel))) slot.userAliases.push(rawLabel);
          const tag = (scope && c.person) ? scope : '';
          if (!slot.options.some((o) => o.value === value && (o.tag || '') === tag)) slot.options.push({ value, tag });
          toast('已记住 → 归入「' + c.label + '」' + (tag ? '·' + tag : '') + ' ✔');
        }
      } else {
        const cur2 = cur;
        let e = cur2.custom.find((x) => x.label === rawLabel);
        if (!e) { e = { label: rawLabel, aliases: [rawLabel], options: [] }; cur2.custom.push(e); }
        if (!e.options.some((o) => o.value === value)) e.options.push({ value, tag: scope || '' });
        toast('新字段「' + rawLabel + '」已独立保存 ✔');
      }
    });
  }

  // ---------- 卡片 UI ----------
  // host id 可被测试页覆盖（harness 避免与真实扩展的 content script 抢同一个 id）
  const HOST_ID = (document.documentElement && document.documentElement.dataset.wsaHostId) || '__wsa_host__';

  function ensureUI() {
    if (host && host.isConnected) return;
    host = document.createElement('div'); host.id = HOST_ID; host.dataset.wsa = '0.4';
    shadow = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style'); st.textContent = STYLE;
    panel = document.createElement('div'); panel.className = 'panel'; panel.style.display = 'none';
    shadow.appendChild(st); shadow.appendChild(panel);
    document.documentElement.appendChild(host);
    panel.addEventListener('mousedown', (e) => e.preventDefault()); // 点击卡片不抢输入框焦点
  }

  function panelVisible() { return !!panel && panel.style.display !== 'none'; }

  function render() {
    ensureUI();
    panel.innerHTML = '';
    state.rows = []; state.sel = -1;
    const label = firstLabel(state.hay);
    const rows = dict ? WSA.buildRows(state.hay, dict) : [];
    const labels = Array.from(new Set(rows.map((r) => r.label)));
    // 有概念命中但没有任何候选值（本机还没存过这类值）——提示要说清楚，
    // 否则用户只看到"没有候选"，不知道是没识别还是没存过
    const matched = (dict && !rows.length) ? WSA.matchConcepts(state.hay, dict) : [];

    const head = document.createElement('div'); head.className = 'head';
    head.title = '按住标题栏拖动可移位；双击恢复自动定位';
    const grip = document.createElement('span'); grip.className = 'grip'; grip.textContent = '⠿ ';
    const hb = document.createElement('span'); hb.className = 'box'; hb.textContent = '框：' + (label || '未识别');
    const hc = document.createElement('span'); hc.textContent = labels.length ? labels.join('、') : '';
    head.append(grip, hb, hc);
    panel.appendChild(head);
    bindHeadDrag(head);

    const body = document.createElement('div'); body.className = 'body';
    const multi = labels.length > 1;
    for (const r of rows) {
      const row = document.createElement('div'); row.className = 'row';
      if (multi) { const s = document.createElement('span'); s.className = 'src'; s.textContent = r.label; row.appendChild(s); }
      const v = document.createElement('span'); v.className = 'val'; v.textContent = (r.weak ? '≈ ' : '') + r.value;
      row.appendChild(v);
      if (r.tag) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = r.tag; row.appendChild(t); }
      const idx = state.rows.length;
      row.addEventListener('click', () => { fill(r); state.sel = idx; markSel(); });
      row.addEventListener('mousemove', () => { state.sel = idx; markSel(); });
      state.rows.push(row);
      body.appendChild(row);
    }
    if (!rows.length) {
      const hint = document.createElement('div'); hint.className = 'hint';
      if (matched.length) {
        hint.textContent = '已识别为「' + matched[0].concept.label + '」，但本机还没存过这类值'
          + (label ? '（框标签「' + label + '」）' : '') + '——先手动填好，再点下面「记住」';
      } else {
        hint.textContent = label ? ('字典里没有「' + label + '」相关候选——先手动填好，再点下面记住') : '未识别出框标签';
      }
      body.appendChild(hint);
    }
    // v0.3：记住入口常驻（候选存在时也能给概念追加值/scope，解决"母亲姓名没法添加"问题）
    const btn = document.createElement('div'); btn.className = 'row add';
    btn.textContent = rows.length ? '＋ 把该框当前内容记住（可加为母亲/紧急联系人等）' : '＋ 记住该框当前内容';
    btn.addEventListener('click', remember);
    body.appendChild(btn);
    panel.appendChild(body);

    const foot = document.createElement('div'); foot.className = 'foot';
    const fs = document.createElement('span'); fs.textContent = '↑↓选 · 回车填 · Esc关' + (state.manual ? ' · 手动位置(双击标题栏恢复)' : '');
    const gear = document.createElement('a'); gear.textContent = '字典管理';
    gear.addEventListener('click', () => { try { chrome.runtime.sendMessage({ type: 'wsa-open-options' }); } catch (e) {} });
    foot.appendChild(fs); foot.appendChild(gear);
    panel.appendChild(foot);

    panel.style.display = 'block';
    position();
  }

  function markSel() {
    state.rows.forEach((r, i) => r.classList.toggle('sel', i === state.sel));
    if (state.rows[state.sel]) state.rows[state.sel].scrollIntoView({ block: 'nearest' });
  }

  // 位置策略：用户拖过 → 尊重手动位置（仅做视口收边）；
  // 否则自动选位：优先框右侧（表单选项常在框下方，弹右侧不挡视线），空间不足再 下→左→上
  function position() {
    if (!state.el || !panel) return;
    const pw = Math.min(360, window.innerWidth - 24);
    panel.style.width = pw + 'px';
    const h = panel.offsetHeight || 160;
    const clampL = (x) => Math.max(8, Math.min(x, window.innerWidth - pw - 8));
    if (state.manual) {
      panel.style.left = Math.max(4, Math.min(state.manual.x, window.innerWidth - pw - 4)) + 'px';
      panel.style.top = Math.max(4, Math.min(state.manual.y, window.innerHeight - h - 4)) + 'px';
      return;
    }
    const r = state.el.getBoundingClientRect();
    let left, top;
    if (r.right + 8 + pw <= window.innerWidth - 8) {
      left = r.right + 8; top = Math.max(8, Math.min(r.top, window.innerHeight - h - 8));
    } else if (r.bottom + 8 + h <= window.innerHeight - 8) {
      left = clampL(r.left); top = r.bottom + 8;
    } else if (r.left - 8 - pw >= 8) {
      left = r.left - 8 - pw; top = Math.max(8, Math.min(r.top, window.innerHeight - h - 8));
    } else {
      left = clampL(r.left); top = Math.max(8, r.top - h - 8);
    }
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
  }

  // 标题栏按住拖动 = 手动定位（后续所有框沿用此位置）；双击标题栏 = 恢复自动
  function bindHeadDrag(head) {
    head.addEventListener('dblclick', () => { state.manual = null; position(); });
    head.addEventListener('mousedown', (e0) => {
      if (e0.button !== 0) return;
      e0.preventDefault();
      const r0 = panel.getBoundingClientRect();
      const sx = e0.clientX, sy = e0.clientY;
      const move = (e1) => {
        state.manual = { x: r0.left + e1.clientX - sx, y: r0.top + e1.clientY - sy };
        position();
      };
      const up = () => {
        window.removeEventListener('mousemove', move, true);
        window.removeEventListener('mouseup', up, true);
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', up, true);
    });
  }

  function hidePanel() { if (panel) panel.style.display = 'none'; state.rows = []; state.sel = -1; }

  function toast(msg, warn) {
    const old = panel && panel.querySelector('.toast'); if (old) old.remove();
    clearTimeout(toastTimer);
    const t = document.createElement('div'); t.className = 'toast' + (warn ? ' warn' : ''); t.textContent = msg;
    panel.appendChild(t);
    toastTimer = setTimeout(() => t.remove(), 2200);
  }

  // ---------- 事件绑定 ----------
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (isEditable(el)) {
      state.el = el; state.hay = haystack(el);
      if (!dict) return; // 存储还没读完，读完后会自动补渲染
      render();
    } else if (!(host && host.contains(el))) {
      hidePanel();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!panelVisible() || !state.el) return;
    if (e.key === 'Escape') { hidePanel(); return; }
    if (!state.rows.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); state.sel = (state.sel + 1) % state.rows.length; markSel(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); state.sel = state.sel <= 0 ? state.rows.length - 1 : state.sel - 1; markSel(); }
    else if (e.key === 'Enter' && state.sel >= 0) { e.preventDefault(); e.stopPropagation(); state.rows[state.sel].click(); }
  }, true);

  window.addEventListener('scroll', () => { if (panelVisible() && !state.manual) position(); }, true);
  window.addEventListener('resize', hidePanel, true);
})();
