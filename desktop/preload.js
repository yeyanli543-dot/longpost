'use strict';

/**
 * 渲染层与主进程之间的唯一通道。
 * 只暴露必要方法，渲染层拿不到 Node / 文件系统。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lp', {
  // 文章
  listArticles: (opts) => ipcRenderer.invoke('articles:list', opts),
  getArticle: (id) => ipcRenderer.invoke('articles:get', id),
  saveArticle: (payload) => ipcRenderer.invoke('articles:save', payload),
  deleteArticle: (id) => ipcRenderer.invoke('articles:delete', id),

  // 回收站
  listTrash: () => ipcRenderer.invoke('articles:trash'),
  restoreArticle: (id) => ipcRenderer.invoke('articles:restore', id),
  purgeArticle: (id) => ipcRenderer.invoke('articles:purge', id),

  // 置顶与标签
  togglePin: (id) => ipcRenderer.invoke('articles:pin', id),
  setTags: (id, tags) => ipcRenderer.invoke('articles:setTags', id, tags),
  listTags: () => ipcRenderer.invoke('tags:list'),

  // 历史版本
  listRevisions: (id) => ipcRenderer.invoke('articles:revisions', id),
  restoreRevision: (id, index) => ipcRenderer.invoke('articles:restoreRevision', id, index),

  // 诊断与提议通道
  getProposals: (id) => ipcRenderer.invoke('proposals:get', id),
  saveProposals: (id, proposals) => ipcRenderer.invoke('proposals:save', id, proposals),
  listUnresolvedProposals: () => ipcRenderer.invoke('proposals:listUnresolved'),

  // 剪贴板
  writeImage: (dataUrl) => ipcRenderer.invoke('clipboard:writeImage', dataUrl),

  // 附件
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  pickImages: () => ipcRenderer.invoke('files:pickImage'),
  listFiles: () => ipcRenderer.invoke('files:list'),

  // 导入：选一个 Markdown / 文本文件，把正文读进来变成一篇新文章
  importArticle: () => ipcRenderer.invoke('article:import'),

  // 导出
  exportHtml: (id) => ipcRenderer.invoke('export:html', id),
  exportMarkdown: (id) => ipcRenderer.invoke('export:markdown', id),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  saveExportImage: (payload) => ipcRenderer.invoke('export:save-image', payload),

  // 应用
  appInfo: () => ipcRenderer.invoke('app:info'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  // WebDAV 跨设备同步网络请求
  webdavRequest: (options) => ipcRenderer.invoke('webdav:request', options),

  // 在应用内开一个受控窗口（分享用），不跳系统浏览器
  openInApp: (payload) => ipcRenderer.invoke('window:openInApp', payload),

  // 静态站导出：渲染层算好 HTML，主进程写盘
  exportStaticSite: (payload) => ipcRenderer.invoke('site:export', payload),

  // 文件夹导入：选目录并把其中的 Markdown 读回来
  pickMarkdownFolder: () => ipcRenderer.invoke('import:pickFolder'),

  // 应用内更新：检查 / 下载 / 拉起安装程序
  updateCheck: (feed) => ipcRenderer.invoke('update:check', feed),
  updateDownload: (info) => ipcRenderer.invoke('update:download', info),
  updateInstall: (filePath) => ipcRenderer.invoke('update:install', filePath),
  onUpdateProgress: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },

  // AI 助手：请求由主进程代发（绕开 file:// 页面的 CORS），逐段流式回传
  aiChat: (payload) => ipcRenderer.invoke('ai:chat', payload),
  aiAbort: (requestId) => ipcRenderer.invoke('ai:abort', requestId),
  onAiChunk: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('ai:chunk', listener);
    return () => ipcRenderer.removeListener('ai:chunk', listener);
  },
});
