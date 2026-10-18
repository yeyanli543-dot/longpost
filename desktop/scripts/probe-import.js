/**
 * 验证 markdown-import 模块在真实渲染进程里加载成功（file:// + 经典脚本），
 * 并跑一遍导入计划，确认纯逻辑在新环境里行为一致。
 */
(async function () {
  const API = window.LPMarkdownImport;
  if (!API) return 'FAIL: window.LPMarkdownImport 未加载';

  const files = [
    { relativePath: '技术/长文写作.md', text: '---\ntags: [写作]\n---\n# 长文写作\n\n正文一' },
    { relativePath: '随笔.md', text: '日记内容' },
    { relativePath: '空.md', text: '' },
    { relativePath: '重复.md', text: '# 长文写作\n重复' },
  ];

  const plan = API.planImport(files, []);
  if (plan.docs.length !== 2) return 'FAIL: 应导入 2 篇，实际 ' + plan.docs.length;
  if (plan.skipped.length !== 2) return 'FAIL: 应跳过 2 篇，实际 ' + plan.skipped.length;
  if (plan.docs[0].tags[0] !== '技术') return 'FAIL: 目录标签没生效：' + plan.docs[0].tags.join(',');

  return 'OK 导入 ' + plan.docs.length + ' 跳过 ' + plan.skipped.length +
    ' | 标题: ' + plan.docs.map((d) => d.title).join(' / ');
})();
