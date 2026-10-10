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

  // 附件
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  pickImages: () => ipcRenderer.invoke('files:pickImage'),
  listFiles: () => ipcRenderer.invoke('files:list'),

  // 导入：选一个 Markdown / 文本文件，把正文读进来变成一篇新文章
  importArticle: () => ipcRenderer.invoke('article:import'),

  // 导出
  exportHtml: (id) => ipcRenderer.invoke('export:html', id),
  exportMarkdown: (id) => ipcRenderer.invoke('export:markdown', id),

  // 应用
  appInfo: () => ipcRenderer.invoke('app:info'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
});
