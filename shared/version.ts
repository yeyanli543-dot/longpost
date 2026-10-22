/**
 * 应用版本号的唯一事实来源（Single Source of Truth）
 *
 * 以前版本号散落在 package.json、README、RSS generator、设置页、桌面端渲染进程等
 * 十几处，发版时总有几处忘记改，导致"界面显示 2.9.6、安装包是 3.2.3"这类问题。
 *
 * 约定：
 * - 构建期（Vite / Nest）：直接 import 本文件；
 * - 桌面端纯 JS 渲染进程：无法 import TS，保留其自身常量，发版脚本需同步；
 * - 打包脚本：从 package.json 读取，不要写死。
 */
export const APP_VERSION = '3.2.3';
