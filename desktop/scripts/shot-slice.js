/**
 * 截图脚本：把「引流短帖」弹窗渲染出来，确认布局与文案没问题。
 * 不调用真实模型 —— 直接塞一段模拟输出进解析器，验证 UI 三块结构。
 */
(async function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  if ($('editorWrap').hidden) {
    $('btnNew').click();
    await wait(900);
  }
  if ($('editorWrap').hidden) return 'FAIL: 新建后编辑器仍未出现';

  $('title').value = '写了三年长文，我才明白没人看的真正原因';
  fire($('title'), 'input');
  $('editor').value = [
    '大部分写作者都卡在同一个地方：文章写完了，但不知道发给谁看。',
    '',
    '内容本身是产品，分发也是产品。少任何一半，另一部分都白做。',
    '',
    '这篇长文想聊三件事：为什么分发比写作更难、长文与短帖的分工、以及怎么让一篇长文长出腿来。',
  ].join('\n');
  fire($('editor'), 'input');
  await wait(400);

  const API = window.LPSocialSlice;
  if (!API) return 'FAIL: window.LPSocialSlice 没加载';

  $('btnSocialSlice').click();
  await wait(400);
  if ($('socialSliceModal').hidden) return 'FAIL: 弹窗没弹出';

  const sample = [
    '【标题】',
    '1. 写了三年长文，我才明白没人看的真正原因',
    '2. 你的文章不是不好，是没人知道它存在',
    '3. 一个让长文自己长腿的办法',
    '',
    '【短帖】',
    '大部分人放弃写作，不是因为写得不好，而是因为写完没人看。内容是产品，分发也是产品。',
    '',
    '【Thread】',
    '1/ 写了没人看，往往不是内容问题，而是分发链路缺了一环。',
    '2/ 长文负责深度，短帖负责把人带到长文。',
    '3/ 每写完一篇，顺手产出三个标题、一条短帖、一组切片。',
  ].join('\n');

  const parsed = API.parseSocialSlice(sample);
  window.__lpRenderSlice(parsed);
  await wait(300);

  return 'OK 标题=' + parsed.titles.length + ' 短帖=' + parsed.post.length + ' Thread=' + parsed.thread.length;
})();
