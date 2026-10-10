'use strict';

/**
 * 渲染层与主进程之间的唯一通道。
 * 只暴露必要方法，渲染层拿不到 Node / 文件系统。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lp', {
  // 文章
  listArticles: () => ipcRenderer.invoke('articles:list'),
  getArticle: (id) => ipcRenderer.invoke('articles:get', id),
  saveArticle: (payload) => ipcRenderer.invoke('articles:save', payload),
  deleteArticle: (id) => ipcRenderer.invoke('articles:delete', id),

  // 附件
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  pickImages: () => ipcRenderer.invoke('files:pickImage'),
  listFiles: () => ipcRenderer.invoke('files:list'),

  // 导出
  exportHtml: (id) => ipcRenderer.invoke('export:html', id),
  exportMarkdown: (id) => ipcRenderer.invoke('export:markdown', id),

  // 应用
  appInfo: () => ipcRenderer.invoke('app:info'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
});
