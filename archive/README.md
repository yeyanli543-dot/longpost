# archive/ — 历史原型归档（不参与构建）

这里存放的是 **2026-10 由 argon 生成、但从未接入主线的并行原型**。
它们在本次优化中被从仓库根目录移出，原因只有一个：**它们不被任何构建工具引用**。

## 为什么确认是"死代码"

| 工具 | 配置 | 结论 |
| :--- | :--- | :--- |
| Vite | `root: client`，别名 `@` → `client/src` | 根目录 `src/` 不在打包入口可达范围内 |
| tsc (前端) | `tsconfig.app.json` → `include: ["client/**/*", "shared/**/*"]` | `src/` 不参与类型检查 |
| tsc (后端) | `tsconfig.node.json` → `include: ["server/**/*", "shared/**/*.ts"]` | `backend/`、`electron/` 不参与类型检查 |
| Nest | `nest-cli.json` → `sourceRoot: "server"` | `backend/` 不参与服务端编译 |
| npm test | `node --test test/*.test.mjs` | 没有任何测试 import 这些目录 |

另外 `archive/src/` 依赖 `zustand` 与 Dexie，而这两个包**从未出现在 package.json 里** —— 也就是说它连 resolve 都过不去，属于无法运行的草稿。

## 文件对照表（原型 → 主线最终实现）

| 归档原型 | 主线位置 | 说明 |
| :--- | :--- | :--- |
| `src/lib/services/syncService.ts` | `client/src/lib/sync/sync-coordinator.ts` | 主线是完整的三向合并 + 墓碑删除 + 冲突另存 |
| `src/lib/services/webdavClient.ts` | `client/src/lib/sync/webdav-client.ts` | 主线增加 RFC 7617 Basic Auth、清单缓存 |
| `src/components/WebDavModal.tsx` | `client/src/components/sync/SyncSettingsModal.tsx` | 主线补齐设备名/立即同步/结果面板 |
| `src/services/aiService.ts` + `AiEngineModal.tsx` | `client/src/lib/ai/universal-llm-client.ts`、`components/editor/ai/*` | 主线支持多厂商 BYO-Key，原型只写死一家 |
| `src/db/dexie.ts` + `store/useDocumentStore.ts` | `client/src/lib/local-store.ts` | 主线用平台的 localStorage/IndexedDB 抽象 |
| `src/utils/canvasRenderer.ts` + `CanvasPreview.tsx` | `client/src/components/editor/tools/WhiteboardCanvas.tsx` | 主线增加了导出成图 |
| `src/types/models.ts` | `client/src/types/models.ts` | 同名文件，主线版本更完整 |
| `backend/src/auth/*` | `server/modules/auth/*` | 主线含 tokenVersion 即时吊销、登录风控 |
| `backend/src/sync/*` | `server/modules/sync/sync.controller.ts` | **原型用内存 Map，不具备生产价值** |
| `backend/src/webdav/*` | `server/modules/sync/sync.controller.ts` | ⚠️ 原型里的 DNS 级 SSRF 防护已被吸收进主线，见下文 |
| `electron/main.cjs` | `desktop/main.js` | 桌面端真实入口在 desktop/ |

## 唯一被"回收"的部分

`backend/src/webdav/webdav.service.ts` 里的 `isPrivateIp()` + `dns.lookup()` 双层校验，
比主线原先只挡 `localhost` / `.local` 的方案更严格。这部分逻辑已经在本次优化中
**提取为 `server/common/security/outbound-host-guard.ts` 并接入生产代码**，
同时由 `test/webdav-ssrf.test.mjs` 直接针对该模块做真实单测（不再是复制一份函数来测）。

---

如果将来要恢复这些原型，直接 `Move-Item archive/src .` 即可，内容一字未改。
