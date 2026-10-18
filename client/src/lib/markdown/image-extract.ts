/**
 * 正文图片链接提取（Markdown + HTML 两种写法）
 *
 * 原本是 AssetManagerModal 组件内部的 useCallback，测试只能照抄一份正则，
 * 抽成纯函数后既能被组件复用，也能被单测直接覆盖。
 */

const MARKDOWN_IMAGE_RE = /!\[.*?\]\((.*?)\)/g;
const HTML_IMAGE_RE = /<img\s+[^>]*?src=["'](.*?)["'][^>]*?>/gi;

export function extractImageUrls(text: string): string[] {
  if (!text) return [];
  const urls: string[] = [];

  // 1. Markdown 语法: ![alt](url "title")
  let mdMatch: RegExpExecArray | null;
  MARKDOWN_IMAGE_RE.lastIndex = 0;
  while ((mdMatch = MARKDOWN_IMAGE_RE.exec(text)) !== null) {
    const u = mdMatch[1]?.trim()?.split(/\s+/)[0]; // 去掉 title 属性
    if (u) urls.push(u);
  }

  // 2. HTML 语法: <img ... src="url" ... />
  let htmlMatch: RegExpExecArray | null;
  HTML_IMAGE_RE.lastIndex = 0;
  while ((htmlMatch = HTML_IMAGE_RE.exec(text)) !== null) {
    const u = htmlMatch[1]?.trim();
    if (u) urls.push(u);
  }

  return urls;
}
