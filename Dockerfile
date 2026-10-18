# syntax=docker/dockerfile:1
#
# LongPost 生产镜像（Web 端：NestJS + React）
#
# 两阶段：build 阶段装全量依赖并编译，runtime 只保留生产依赖 + 产物。
# 桌面 / 安卓是独立分发（Electron / Capacitor），不走这个镜像。

# ---------- 构建阶段 ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# 先只拷清单，让依赖层可缓存；改代码不会触发重新 npm ci
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# ---------- 运行阶段 ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=3000 \
    UPLOAD_DIR=/data/uploads \
    VENDOR_DIR=/app/client/public/vendor

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# 编译产物
COPY --from=build /app/dist ./dist
# 公开阅读页的图表运行时要靠这个目录（/vendor 静态资源）
COPY --from=build /app/client/public/vendor ./client/public/vendor

RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node

EXPOSE 3000
VOLUME ["/data/uploads"]

# 探活：命中站点设置接口，能返回 JSON 说明 DB 与路由都通了
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/site-settings').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/main.js"]
