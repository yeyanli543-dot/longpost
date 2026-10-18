import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 刘海 / 挖孔屏安全区测试
 *
 * 以前这个文件在自己内部定义 NOTCH_CONFIG 再断言它自己 —— 测的是测试文件本身。
 * 现在改成校验真实样式表与主题 hook 的一致性：任何一侧改了 class 名而另一边没跟上，
 * 都会在这里暴露。
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'client/src/index.css'), 'utf8');
const THEME_HOOK = fs.readFileSync(path.join(ROOT, 'client/src/hooks/useTheme.ts'), 'utf8');

const NOTCH_CLASSES = ['notch-punch-hole', 'notch-island', 'notch-compact'];

describe('Punch-hole & Theme Tokens Suite', () => {
  it('三种刘海模式必须在样式表中定义', () => {
    for (const cls of NOTCH_CLASSES) {
      assert.ok(CSS.includes(`html.${cls}`), `index.css 缺少 ${cls} 规则`);
    }
  });

  it('主题 hook 必须能清除全部刘海模式类名', () => {
    for (const cls of NOTCH_CLASSES) {
      assert.ok(THEME_HOOK.includes(cls), `useTheme.ts 未处理 ${cls}`);
    }
    assert.ok(
      /classList\.remove\([^)]*notch-punch-hole[^)]*notch-island[^)]*notch-compact/.test(THEME_HOOK),
      '切换模式时必须一次性移除三个类名，避免叠加',
    );
  });

  it('安全区变量必须使用 env() 兜底，兼容不支持 safe-area 的浏览器', () => {
    assert.ok(CSS.includes('safe-area-inset-top'), '必须读取系统安全区变量');
    assert.ok(/env\(\s*safe-area-inset-top[^)]*\)/.test(CSS), 'safe-area 必须包在 env() 里');
  });
});
