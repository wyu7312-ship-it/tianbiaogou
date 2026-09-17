// 填表狗 · 纯逻辑层（无 DOM；tests/unit.html 直接加载测试）
(() => {
  'use strict';
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s:：*＊()（)）\[\]【】"'、.,，/·-]/g, ''); }
  function bigrams(s) { const a = []; for (let i = 0; i < s.length - 1; i++) a.push(s.slice(i, i + 2)); return a; }
  function shingleScore(a, b) {
    const A = new Set(bigrams(a)), B = new Set(bigrams(b));
    if (!A.size || !B.size) return 0;
    let n = 0; A.forEach((x) => { if (B.has(x)) n++; });
    return n / Math.min(A.size, B.size);
  }
  // 概念的匹配词 = 内置中英词表 + 用户"记住"积累的别名（归一化，≥2字符防单字误伤）
  function wordsOf(c, dict) {
    const extra = (dict && dict.concepts && dict.concepts[c.id] ? dict.concepts[c.id].userAliases : []).slice();
    return c.zh.concat(c.en, extra).map(norm).filter((w) => w && w.length >= 2);
  }
  // 第1级：标签归一化后完整包含概念词即命中；score=最长命中词长（具体度），降序取前4
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
  // 人称限定词识别（W SA_QUALIFIERS 数组顺序=优先级）；返回 alias 或 null
  function detectQualifier(hay) {
    const hn = hay.map(norm);
    for (const q of (window.WSA_QUALIFIERS || []))
      for (const w of q.words) if (hn.some((h) => h.includes(norm(w)))) return q.alias;
    return null;
  }
  // 该概念是否有"完全等于该标签词"的匹配词。
  // 用于区分「联系电话」命中 phone（电话 == 整串，是真命中）与
  // 「身份证号码」捎带命中 phone（号码 ⊂ 身份证号码，属过度匹配）。
  function hasExactWord(c, dict, words) {
    for (const w of wordsOf(c, dict)) for (const s of words) if (s === w) return true;
    return false;
  }

  // 卡片行模型：强命中概念全列候选；零强命中时按二字滑片重叠≥0.5 给弱命中（weak 标记，前缀≈由 UI 渲染）
  function buildRows(hay, dict) {
    let hits = matchConcepts(hay, dict);
    let weak = false;
    if (!hits.length) {
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
    // 过度匹配抑制：低分概念只是"高分概念匹配词的子串"时（号码 ⊂ 身份证号码），
    // 该框与它无关 —— 若此时还给它列候选，用户会在「紧急联系人电话」框里看到自己的手机号。
    // 仅当低分概念没有"等于整串"的匹配词时才抑制（"联系电话"的"电话"等于整串 → 不抑制）。
    if (hits.length > 1) {
      const topWords = wordsOf(hits[0].concept, dict);
      const strs = hay.map(norm).filter((s) => s.length >= 2);
      const topBest = hits[0].score;
      hits = hits.filter((h, i) => {
        if (i === 0) return true;
        if (h.score >= topBest) return true;
        if (hasExactWord(h.concept, dict, strs)) return true;
        const wl = wordsOf(h.concept, dict);
        const sub = wl.some((lw) => topWords.some((tw) => tw.length > lw.length && tw.includes(lw)));
        return !sub;
      });
    }
    const rows = [];
    for (const { concept } of hits) {
      const opts = concept.custom ? concept.custom.options
        : ((dict.concepts && dict.concepts[concept.id]) || {}).options || [];
      // 注：custom 命中时 matchConcepts 已把条目挂在 concept.custom 上，不走 dict.concepts[id]
      for (const o of opts) {
        if (rows.length >= 14) break;
        rows.push({ value: o.value, tag: o.tag || '', label: concept.label, weak });
      }
    }
    return rows;
  }
  // 种子 v2：概念骨架、候选值全空（真实数据只进用户本机 chrome.storage）
  function seedV2() {
    const concepts = {};
    for (const c of (window.WSA_CONCEPTS || [])) concepts[c.id] = { userAliases: [], options: [] };
    return { version: 2, concepts, custom: [] };
  }
  function builtinWord(label, c) { return c.zh.concat(c.en).some((w) => norm(w) === norm(label)); }
  // v1（[{label,aliases,options}] 碎标签列表）→ v2（按概念归位）：纯函数，可重复执行结果一致
  function migrateV1(v1list, concepts) {
    const v2 = seedV2();
    for (const e of (v1list || [])) {
      const hay = [e.label].concat(e.aliases || []);
      const hits = matchConcepts(hay, v2);
      const scope = detectQualifier(hay);
      if (hits.length && !hits[0].concept.custom) {
        const c = hits[0].concept;
        const slot = v2.concepts[c.id];
        if (e.label && !builtinWord(e.label, c) && !slot.userAliases.includes(e.label)) slot.userAliases.push(e.label);
        for (const o of (e.options || [])) {
          const no = { value: o.value, tag: o.tag || (scope && c.person ? scope : '') || '' };
          if (!slot.options.some((x) => x.value === no.value && (x.tag || '') === no.tag)) slot.options.push(no);
        }
      } else {
        const ex = v2.custom.find((x) => x.label === e.label);
        if (ex) { for (const o of (e.options || [])) if (!ex.options.some((x) => x.value === o.value)) ex.options.push(o); }
        else v2.custom.push({ label: e.label, aliases: (e.aliases || []).slice(), options: (e.options || []).slice() });
      }
    }
    return v2;
  }
  // 首启向导 schema：options 页据此建初始化表单；secret=true 的敏感项界面标"选填·只存本机"
  const SECRET_IDS = ['idno', 'birthdate', 'phone', 'email', 'address', 'qq', 'emergency'];
  function wizardFields() {
    return (window.WSA_CONCEPTS || []).map((c) => ({
      id: c.id, label: c.label, person: !!c.person,
      zhHint: c.zh.slice(0, 3).join('/'),
      secret: SECRET_IDS.includes(c.id),
    }));
  }
  // 保存前清洗（content.js 与 options.js 共用，保证两条写入路径产出一致）：
  // 去空候选值、去空别名、trim、按概念表补骨架。纯函数，便于单测。
  function cleanDict(d, concepts) {
    const out = { version: 2, concepts: {}, custom: [] };
    const LIST = concepts || window.WSA_CONCEPTS || [];
    const uniq = (arr) => Array.from(new Set(arr));
    const src = (d && d.concepts) || {};   // 入参为 null 时仍返回完整骨架，别返回空对象
    for (const c of LIST) {
      const s = src[c.id] || { userAliases: [], options: [] };
      out.concepts[c.id] = {
        userAliases: uniq((s.userAliases || []).map((x) => String(x).trim()).filter(Boolean)),
        options: (s.options || [])
          .filter((o) => o && String(o.value == null ? '' : o.value).trim())
          .map((o) => ({ value: String(o.value).trim(), tag: String(o.tag == null ? '' : o.tag) })),
      };
    }
    for (const e of ((d && d.custom) || [])) {
      if (!e) continue;
      const label = String(e.label || '').trim();
      if (!label) continue;
      out.custom.push({
        label,
        aliases: uniq((e.aliases || []).map((x) => String(x).trim()).filter(Boolean)),
        options: (e.options || [])
          .filter((o) => o && String(o.value == null ? '' : o.value).trim())
          .map((o) => ({ value: String(o.value).trim(), tag: String(o.tag == null ? '' : o.tag) })),
      });
    }
    return out;
  }
  window.WSA = { norm, bigrams, shingleScore, wordsOf, matchConcepts, detectQualifier, buildRows, seedV2, migrateV1, wizardFields, cleanDict };
})();
