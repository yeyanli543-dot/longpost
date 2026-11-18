import { readFile } from 'node:fs';
import Handlebars, { type TemplateDelegate } from 'handlebars';

// Only the SPA shell uses this engine. Keeping template data separate from
// Express options prevents callers from changing layout or filesystem settings.
const handlebars = Handlebars.create();
const templates = new Map<string, TemplateDelegate>();
const fields = ['__platform__', 'assetBase', 'ogTitle', 'ogDescription', 'ogImage', 'ogUrl', 'twitterCard'] as const;

export function htmlViewEngine(
  filename: string,
  options: Record<string, unknown>,
  callback: (error: Error | null, html?: string) => void,
): void {
  const render = (template: TemplateDelegate) => {
    let html: string;
    try {
      const data = Object.fromEntries(fields.map((key) => [key, typeof options[key] === 'string' ? options[key] : '']));
      html = template(data);
    } catch (error) {
      return callback(error instanceof Error ? error : new Error(String(error)));
    }
    callback(null, html);
  };

  const cached = options.cache && templates.get(filename);
  if (cached) return render(cached);
  readFile(filename, 'utf8', (error, source) => {
    if (error) return callback(error);
    let template: TemplateDelegate;
    try {
      template = handlebars.compile(source);
      if (options.cache) templates.set(filename, template);
    } catch (compileError) {
      return callback(compileError instanceof Error ? compileError : new Error(String(compileError)));
    }
    render(template);
  });
}

/** JSON embedded inside a single-quoted inline script string. */
export function serializePlatformData(value: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(value ?? {}) ?? '{}';
  } catch {
    json = '{}';
  }
  return json
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\x27')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')
    .replace(/&/g, '\\x26')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
