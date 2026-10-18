import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 直接 import 生产实现：以前这个文件在测试内部定义 validate() 再断言自己，等于没测
import { isAccessTokenPayloadUsable } from '../server/common/utils/jwt-payload.ts';
import { decideThreeWayAction } from '../shared/sync/three-way-merge.ts';

describe('JWT Strategy & Sync Optimistic Locking Suite', () => {
  it('JWT 校验必须坚决拒绝 type === "refresh" 的令牌作为 Access Token', () => {
    assert.equal(isAccessTokenPayloadUsable({ sub: 'user-1', type: 'refresh' }), false);
    assert.equal(isAccessTokenPayloadUsable({ sub: 'user-1', type: 'access' }), true);
  });

  it('缺少 sub 或空 sub 的载荷必须直接判无效，不依赖下游查库兜底', () => {
    assert.equal(isAccessTokenPayloadUsable({ type: 'access' }), false);
    assert.equal(isAccessTokenPayloadUsable({ sub: '' }), false);
    assert.equal(isAccessTokenPayloadUsable({ sub: 123 }), false);
    assert.equal(isAccessTokenPayloadUsable(null), false);
    assert.equal(isAccessTokenPayloadUsable(undefined), false);
  });

  it('同步冲突保护：跨端并发修改绝不静默覆盖，必须走冲突备份', () => {
    const base = { rev: 1, checksum: 'hash_v1', updatedAt: 1000 };

    const concurrent = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'hash_local_v2',
      remoteItem: { rev: 2, checksum: 'hash_remote_v2', updatedAt: 2000 },
      baseItem: base,
    });
    assert.equal(concurrent.action, 'CONFLICT_BACKUP');

    // 只有一端改动时不得误报冲突
    const localOnly = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'hash_v2',
      remoteItem: { rev: 1, checksum: 'hash_v1', updatedAt: 1000 },
      baseItem: base,
    });
    assert.equal(localOnly.action, 'PUSH_UPDATE');
  });

  it('墓碑软删除：本地删除必须推送墓碑，旧设备不会把文章复活', () => {
    const deletedLocally = decideThreeWayAction({
      hasLocal: false,
      baseItem: { rev: 1, checksum: 'hash_v1', updatedAt: 1000 },
      remoteItem: { rev: 1, checksum: 'hash_v1', updatedAt: 1000 },
    });
    assert.equal(deletedLocally.action, 'PUSH_TOMBSTONE');

    // 远端已墓碑，本地无改动 -> 跟随删除
    const followRemote = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'hash_v1',
      baseItem: { rev: 1, checksum: 'hash_v1', updatedAt: 1000 },
      remoteItem: { rev: 2, checksum: '', isDeleted: true, updatedAt: 2000 },
    });
    assert.equal(followRemote.action, 'DELETE_LOCAL');
  });
});
