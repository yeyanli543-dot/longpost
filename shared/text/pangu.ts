/**
 * 盘古之白（Pangu Spacing）排版格式化
 *
 * 在中英文、中文与数字之间补上视觉呼吸空格，同时严格保护不该被改动的部分：
 * 代码块、行内代码、Markdown 链接/图片、行首缩进。
 *
 * 抽到 shared/ 的原因：它是纯字符串函数，不依赖 React，
 * 放在组件文件里就只能被"抄一份"的测试覆盖。
 */

export function panguFormat(text: string): string {
  if (!text) return text;

  const placeholders: string[] = [];
  const stash = (match: string) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `\u0000PANGU_PH_${idx}\u0000`;
  };

  let result = text;
  // 1. 保护多行代码块 ```...```
  result = result.replace(/```[\s\S]*?```/g, stash);
  // 2. 保护行内代码 `...`
  result = result.replace(/`[^`\n]+`/g, stash);
  // 3. 保护 Markdown 图片与链接 ![...](...) / [...](...)
  result = result.replace(/!?\[[^\]]*\]\([^)]*\)/g, stash);

  // 4. 逐行处理正文，保留行首缩进 ^[ \t]+
  result = result
    .split('\n')
    .map((line) => {
      const indentMatch = line.match(/^([ \t]+)(.*)$/);
      const indent = indentMatch ? indentMatch[1] : '';
      let body = indentMatch ? indentMatch[2] : line;

      // 中文与英文/数字之间加空格
      body = body.replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2');
      body = body.replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
      // 中文与百分号/数字
      body = body.replace(/([\u4e00-\u9fa5])([0-9]+%?)/g, '$1 $2');
      body = body.replace(/([0-9]+%?)([\u4e00-\u9fa5])/g, '$1 $2');
      // 修正多余水平空格（不影响行首缩进）
      body = body.replace(/[ \t]{2,}/g, ' ');

      return indent + body;
    })
    .join('\n');

  // 5. 还原受保护片段
  result = result.replace(/\u0000PANGU_PH_(\d+)\u0000/g, (_: string, idx: string) => placeholders[Number(idx)] ?? '');
  return result;
}
