/**
 * 用 Electron 把 docs/whitepaper.html 打印成 PDF。
 *
 * 选 Electron 而不是 headless Chrome / LibreOffice：仓库里没有 Chrome，
 * 但 Electron 本来就在，printToPDF 对中文字体与分页的处理也更可控。
 */

'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', '..', 'docs', 'whitepaper.html');
const pdfPath = path.join(__dirname, '..', '..', 'docs', 'whitepaper.pdf');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { offscreen: true, sandbox: true },
  });

  await win.loadFile(htmlPath);
  await new Promise((resolve) => setTimeout(resolve, 800));

  const data = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.5, right: 0.5 },
    preferCSSPageSize: true,
  });

  fs.writeFileSync(pdfPath, data);
  console.log('[whitepaper] PDF: ' + pdfPath + ' (' + Math.round(data.length / 1024) + ' KB)');
  app.quit();
});
