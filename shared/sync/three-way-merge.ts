/**
 * 三向合并裁决引擎 (Three-Way Merge Decision Engine)
 *
 * 把"本地最新 / 远端最新 / 上次同步基准"三者的比对结果，收敛成一个纯函数：
 * 输入三个快照元数据，输出一个动作枚举。不碰网络、不碰存储、不碰 UI。
 *
 * 之所以单独抽出来，是因为这段裁决逻辑原本和 WebDAV 的读写死死缠在一起，
 * 导致测试没法直接覆盖 —— 只能把算法抄一份到测试文件里"模拟"，
 * 抄的版本和线上版本的偏差永远不会被发现。抽成纯函数后，
 * test/sync-protocol-and-coordinator.test.mjs 直接 import 本文件做真单测。
 */

import type { SyncManifestItem } from './sync-protocol';

/** 裁决动作 */
export type SyncAction =
  /** 远端有修改、本地已删除：放弃删除，拉回远端版本 */
  | 'PULL_DELETE_CONFLICT'
  /** 本地删除：向远端推送墓碑，防止旧设备复活 */
  | 'PUSH_TOMBSTONE'
  /** 远端新增：拉取到本地 */
  | 'PULL_NEW'
  /** 远端已墓碑删除，但本地删除后又改过：复活并推送本地版本 */
  | 'REVIVE_AND_PUSH'
  /** 远端已墓碑删除，本地没改动：本地跟随删除 */
  | 'DELETE_LOCAL'
  /** 两端已一致：什么都不做 */
  | 'NOOP'
  /** 仅本地修改：推送 */
  | 'PUSH_UPDATE'
  /** 仅远端修改：拉取 */
  | 'PULL_UPDATE'
  /** 双端并发修改：本地版本另存冲突备份，然后拉取远端 */
  | 'CONFLICT_BACKUP'
  /** 本地新文章首次同步：推送 */
  | 'PUSH_NEW';

export interface ThreeWayInput {
  /** 本地是否存在这篇文章 */
  hasLocal: boolean;
  /** 本地正文的 SHA-256；本地不存在时可省略 */
  localChecksum?: string;
  /** 上次成功同步时的基准快照条目 */
  baseItem?: SyncManifestItem;
  /** 远端清单里的条目 */
  remoteItem?: SyncManifestItem;
}

export interface ThreeWayDecision {
  action: SyncAction;
  /** 人类可读的裁决理由，写日志与排查用 */
  reason: string;
}

/**
 * 判定某篇文章这一次同步该走哪个分支。
 *
 * 判定顺序与线上行为严格一致（A → B → C1..C5）：
 * 先处理"本地没有"的情况，再处理"远端是墓碑"的情况，最后才是普通修改比对。
 */
export function decideThreeWayAction(input: ThreeWayInput): ThreeWayDecision {
  const { hasLocal, localChecksum, baseItem, remoteItem } = input;

  // ===== 场景 A：本地已没有这篇文章 =====
  if (!hasLocal) {
    // A1. 基准里存在且未删除 —— 说明是本地主动删掉的
    if (baseItem && !baseItem.isDeleted) {
      // 删改冲突：远端在本地删除后又被改过，优先保住远端内容
      if (remoteItem && !remoteItem.isDeleted && remoteItem.checksum !== baseItem.checksum) {
        return { action: 'PULL_DELETE_CONFLICT', reason: '远端有更新，拉回本地被删的文章' };
      }
      return { action: 'PUSH_TOMBSTONE', reason: '本地已删除，向远端推送墓碑' };
    }
    // A2. 基准里没有（或本就是墓碑），远端有未删除的一篇 —— 拉到本地
    if (remoteItem && !remoteItem.isDeleted) {
      return { action: 'PULL_NEW', reason: '远端新增文章，拉取到本地' };
    }
    return { action: 'NOOP', reason: '本地与远端都没有这篇未删除的文章' };
  }

  // ===== 场景 B：本地有，但远端是墓碑 =====
  if (remoteItem && remoteItem.isDeleted) {
    if (baseItem && localChecksum !== baseItem.checksum) {
      return { action: 'REVIVE_AND_PUSH', reason: '本地在远端删除后又有修改，复活并推送' };
    }
    return { action: 'DELETE_LOCAL', reason: '远端已删除且本地无改动，跟随删除' };
  }

  // ===== 场景 C：本地有，远端也有（或远端还没有） =====
  const isLocalChanged = !baseItem || localChecksum !== baseItem.checksum;
  const isRemoteChanged =
    Boolean(remoteItem) && (!baseItem || remoteItem?.checksum !== baseItem.checksum);

  // C1. 两端哈希一致 —— 已经同步过了
  if (remoteItem && localChecksum === remoteItem.checksum) {
    return { action: 'NOOP', reason: '两端内容哈希一致，无需传输' };
  }

  // C0. 远端与本机基准都没有这条记录 —— 真正的新文章首次上传
  // （必须放在 C2 之前，否则会被"仅本地修改"先吃掉，PUSH_NEW 分支永远走不到）
  if (!remoteItem && !baseItem) {
    return { action: 'PUSH_NEW', reason: '本地新文章首次同步，推送到远端' };
  }

  // C2. 只有本地变了
  if (isLocalChanged && !isRemoteChanged) {
    return { action: 'PUSH_UPDATE', reason: '仅本地有修改，推送到远端' };
  }

  // C3. 只有远端变了
  if (!isLocalChanged && isRemoteChanged && remoteItem) {
    return { action: 'PULL_UPDATE', reason: '仅远端有修改，拉取到本地' };
  }

  // C4. 两端都变了 —— 冲突保护，绝不静默覆盖
  if (isLocalChanged && isRemoteChanged && remoteItem) {
    return { action: 'CONFLICT_BACKUP', reason: '双端并发修改，本地版本另存备份后再拉取远端' };
  }

  // C5. 远端清单丢了这条记录，但本机基准里还有 —— 重新补传（rev 归位）
  if (!remoteItem) {
    return { action: 'PUSH_NEW', reason: '远端清单缺失该文章，重新补传' };
  }

  return { action: 'NOOP', reason: '未命中任何变更条件' };
}
