// 填表狗 · 后台：接收"字典管理"按钮消息，打开选项页
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'wsa-open-options') chrome.runtime.openOptionsPage();
  return false;
});
