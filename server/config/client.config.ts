/**
 * 客户端静态资源前缀。
 *
 * 在妙搭平台里部署时，前端资源挂在 /app/<appId>/ 下；
 * 部署到自己的服务器（独立部署）时，前端就在站点根目录，此时应为空字符串。
 *
 * 用 CLIENT_BASE_PATH 显式覆盖；不设置则沿用平台路径，保证现有部署不受影响。
 */
const rawClientBasePath = process.env.CLIENT_BASE_PATH;

export const ASSET_BASE_PATH =
  rawClientBasePath === undefined
    ? '/app/app_17ea4bnn0xw'
    : rawClientBasePath.trim().replace(/\/+$/, '');
