/* Catch a production build that succeeds but omits Tailwind's utility layer. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

const output = path.resolve(__dirname, '../dist/client');
const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
const cssFiles = Array.from(html.matchAll(/href=["']([^"']+\.css)["']/g), (match) => match[1]);
if (!cssFiles.length) throw new Error('Client build has no stylesheet linked from index.html');

const checks = [
  { selector: '.flex', property: 'display', value: 'flex' },
  { selector: '.hidden', property: 'display', value: 'none' },
  { selector: '.md\\:hidden', property: 'display', value: 'none', media: true },
  { selector: '.text-foreground', property: 'color' },
  { selector: '.bg-background', property: 'background-color' },
];
const found = new Set();
function withinMedia(rule) {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'media') return true;
  }
  return false;
}

for (const href of cssFiles) {
  const filename = path.resolve(output, href.replace(/^\//, ''));
  if (!filename.startsWith(output + path.sep)) throw new Error('Invalid stylesheet path in client build');
  const css = postcss.parse(fs.readFileSync(filename, 'utf8'), { from: filename });
  css.walkRules((rule) => {
    const selectors = rule.selector.split(',').map((selector) => selector.trim());
    for (const check of checks) {
      if (!selectors.includes(check.selector)) continue;
      if (check.media && !withinMedia(rule)) continue;
      if (rule.nodes.some((node) => node.type === 'decl' && node.prop === check.property && (!check.value || node.value === check.value))) {
        found.add(check.selector);
      }
    }
  });
}

const missing = checks.filter((check) => !found.has(check.selector)).map((check) => check.selector);
if (missing.length) throw new Error('Client CSS is missing required utilities: ' + missing.join(', '));
console.log('[client-css] Essential layout, theme and responsive utilities are present.');
