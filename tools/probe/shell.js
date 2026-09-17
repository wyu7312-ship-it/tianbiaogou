(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms || 100));
  for (let i = 0; i < 80 && !window.__shellReady; i++) await wait(100);

  const fr = document.getElementById('fr');
  const W = fr && fr.contentWindow;
  const D = fr && fr.contentDocument;
  if (!W || !D) return 'ERR: iframe 未就绪';

  // 隔离性自检：真实扩展是否注入了这个 about:blank iframe？
  const extHost = D.getElementById('__wsa_host__');
  const diag = { extensionInjected: !!extHost, hostIdAttr: D.documentElement.dataset.wsaHostId || null };

  for (let i = 0; i < 80 && !W.__H; i++) await wait(100);
  const H = W.__H;
  if (!H) return 'ERR: iframe 内 harness 未就绪 ' + JSON.stringify(diag);

  // 在 iframe 自己的 realm 里装 chrome.storage.local 垫片（独立键，绝不碰真实字典）
  const shimSrc = `
    (() => {
      const KEY = '__wsa_harness_store_v2__';
      let iframeLocalStore = {};
      try { iframeLocalStore = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { iframeLocalStore = {}; }
      const iframeListeners = [];
      const iframeClone = (x) => JSON.parse(JSON.stringify(x));
      const iframeSave = () => { try { localStorage.setItem(KEY, JSON.stringify(iframeLocalStore)); } catch (e) {} };
      window.chrome = {
        storage: {
          local: {
            get(keys, cb) {
              let out = {};
              if (keys == null) out = iframeClone(iframeLocalStore);
              else if (typeof keys === 'string') { if (keys in iframeLocalStore) out[keys] = iframeClone(iframeLocalStore[keys]); }
              else if (Array.isArray(keys)) keys.forEach((k) => { if (k in iframeLocalStore) out[k] = iframeClone(iframeLocalStore[k]); });
              setTimeout(() => cb && cb(out), 0);
            },
            set(obj, cb) {
              const chg = {};
              Object.keys(obj).forEach((k) => { iframeLocalStore[k] = iframeClone(obj[k]); chg[k] = { newValue: iframeClone(obj[k]) }; });
              iframeSave(); iframeListeners.forEach((fn) => fn(chg, 'local'));
              if (cb) setTimeout(cb, 0);
            },
            remove(arr, cb) { arr.forEach((k) => { delete iframeLocalStore[k]; }); iframeSave(); if (cb) setTimeout(cb, 0); },
          },
          onChanged: { addListener: (fn) => iframeListeners.push(fn) },
        },
        runtime: { sendMessage: () => {}, getURL: (p) => p },
      };
      window.__store = () => iframeClone(iframeLocalStore);
      window.__reset = () => { iframeLocalStore = {}; iframeSave(); };
    })();
  `;
  const sc = D.createElement('script');
  sc.textContent = shimSrc;
  D.documentElement.appendChild(sc);

  // 清干净并播假名字典
  if (W.__reset) W.__reset();
  await wait(60);
  await H.seed();
  await wait(80);
  diag.seededName = (W.__store().wsa_dict_v2.concepts.name.options || []).map((o) => o.value);

  async function bundle() {
    const parts = ['../data.js', '../matcher.js', '../content.js'];
    const bust = '?t=' + Date.now();
    const texts = await Promise.all(parts.map((p) => fetch(p + bust).then((r) => {
      if (!r.ok) throw new Error('fetch ' + p + ' ' + r.status);
      return r.text();
    })));
    return texts.join('\n;\n');
  }

  try {
    const out = await H.runAll(await bundle());
    diag.hostVer = (D.getElementById('__wsa_harness_host__') || { dataset: {} }).dataset
      ? D.getElementById('__wsa_harness_host__').dataset.wsa : null;
    return 'DIAG ' + JSON.stringify(diag) + '\n' + out;
  } catch (e) {
    return 'DIAG ' + JSON.stringify(diag) + '\nERR: ' + (e && (e.stack || e.message) || e);
  }
})()
