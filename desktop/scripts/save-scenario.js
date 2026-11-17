(async function () {
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until(check, message) {
    for (let i = 0; i < 100; i += 1) {
      if (await check()) return;
      await wait(50);
    }
    throw new Error(message);
  }
  const fireInput = (el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const lp = window.LPPlatform;
  if (!lp || !lp.isDesktop) throw new Error('桌面平台未启动');
  $('btnNew').click();
  await until(() => !$('editorWrap').hidden, '新建文章未打开');
  const first = (await lp.listArticles()).find((item) => item.title === '未命名文章');
  if (!first) throw new Error('找不到新建文章');

  const realSave = lp.saveArticle;
  let started = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  lp.saveArticle = async (payload) => {
    if (payload.id === first.id && payload.content === '第一次输入') {
      started = true;
      await gate;
    }
    return realSave(payload);
  };
  fireInput($('editor'), '第一次输入');
  await until(() => started, '自动保存没有启动');
  fireInput($('editor'), '写入中继续输入的最新内容');
  $('btnNew').click();
  await wait(100);
  release();
  await until(async () => (await lp.listArticles()).length >= 3, '等待保存后新建文章失败');
  await until(async () => (await lp.getArticle(first.id)).content === '写入中继续输入的最新内容', '写入中输入的内容丢失');
  await until(() => $('editor').value === '', '第二篇文章没有打开');

  const countBefore = (await lp.listArticles()).length;
  lp.saveArticle = async () => { throw new Error('模拟保存失败'); };
  fireInput($('editor'), '保存失败后必须保留的文字');
  $('btnNew').click();
  await wait(300);
  if ($('editor').value !== '保存失败后必须保留的文字') throw new Error('保存失败后切换丢失文字');
  if ((await lp.listArticles()).length !== countBefore) throw new Error('保存失败仍创建了下一篇');
  lp.saveArticle = realSave;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  await until(async () => (await lp.listArticles()).some((item) => item.summary === '保存失败后必须保留的文字'), '重试后未保存');
  const second = (await lp.listArticles()).find((item) => item.summary === '保存失败后必须保留的文字');
  const chooseMore = (label) => {
    $('btnMore').click();
    const item = Array.from(document.querySelectorAll('#ctxMenu .menu-item')).find((el) => (el.textContent || '').includes(label));
    if (!item) throw new Error('更多菜单缺少：' + label);
    item.click();
  };

  // 回滚前尚未自动保存的内容必须进入历史，而不能被旧版本覆盖。
  fireInput($('editor'), '回滚前尚未保存的内容');
  chooseMore('历史版本');
  await until(() => !$('historyModal').hidden && $('historyList').querySelector('[data-rollback]'), '历史版本没有打开');
  $('historyList').querySelector('[data-rollback]').click();
  await until(async () => (await lp.listRevisions(second.id)).some((item) => item.content === '回滚前尚未保存的内容'), '回滚丢失未保存内容');
  await wait(200);
  $('historyOk').click();

  // 移入回收站前同样要保存最新正文。
  fireInput($('editor'), '删除前尚未保存的内容');
  chooseMore('删除（进回收站）');
  await until(() => !$('confirmModal').hidden, '删除确认框没有打开');
  $('confirmOk').click();
  await until(async () => (await lp.listTrash()).some((item) => item.id === second.id), '文章没有进入回收站');
  if ((await lp.getArticle(second.id)).content !== '删除前尚未保存的内容') throw new Error('回收站里的正文不是最新内容');
  const install = await lp.updateInstall('C:\\untrusted.exe');
  if (install.ok) throw new Error('未校验更新包却允许安装');
  return 'PASS: 并发编辑、失败重试、回滚与回收站保护、更新安装权限';
})();
