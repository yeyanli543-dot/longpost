import { isAbsolute, join } from 'path';

function resolveDir(value: string | undefined, fallbackName: string): string {
  if (!value) return join(process.cwd(), fallbackName);
  return isAbsolute(value) ? value : join(process.cwd(), value);
}

/**
 * 第三方前端静态资源（例如 echarts 的浏览器版本）的托管配置。
 *
 * 公开阅读页是服务端直出的 HTML，图表需要在浏览器里由 echarts 渲染，
 * 所以这个脚本必须由本站自己提供，不能依赖外部 CDN（断网 / 被墙都会白屏）。
 */
export const vendorConfig = {
  /** 静态资源目录 */
  dir: resolveDir(process.env.VENDOR_DIR, join('client', 'public', 'vendor')),
  /** 对外访问前缀 */
  urlPrefix: (process.env.VENDOR_URL_PREFIX || '/vendor').replace(/\/+$/, ''),
};
