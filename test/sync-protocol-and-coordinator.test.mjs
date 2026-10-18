import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 真实 import 生产代码（Node 24 原生擦除 TS 类型），不再在测试里"模拟"一份。
import {
  computeContentChecksum,
  formatConflictTitle,
} from '../shared/sync/sync-protocol.ts';
import { decideThreeWayAction } from '../shared/sync/three-way-merge.ts';
import { buildBasicAuthHeader } from '../shared/sync/basic-auth.ts';

describe('Sync Protocol & WebDAV Client Units', () => {
  it('计算正文 SHA-256 Checksum 保持强确定性与标准 64 字符十六进制', async () => {
    const text1 = '# Hello LongPost\nThis is an article.';
    const text2 = '# Hello LongPost\nThis is an article.';
    const text3 = '# Hello LongPost\nThis is a modified article.';

    const hash1 = await computeContentChecksum(text1);
    const hash2 = await computeContentChecksum(text2);
    const hash3 = await computeContentChecksum(text3);

    assert.equal(hash1.length, 64);
    assert.match(hash1, /^[0-9a-f]{64}$/, '必须是 64 位小写十六进制');
    assert.equal(hash1, hash2, '相同内容哈希值必须完全一致');
    assert.notEqual(hash1, hash3, '不同内容哈希值必须不一致');

    // 与标准 SHA-256 对齐，证明不是自造的弱哈希
    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update(text1, 'utf8').digest('hex');
    assert.equal(hash1, expected);
  });

  it('冲突备份标题格式严格符合：原标题 (冲突备份-设备名-YYYYMMDD-HHmm)', () => {
    const fakeDate = new Date(2026, 9, 14, 21, 15); // 2026-10-14 21:15
    const conflictTitle = formatConflictTitle('分布式系统设计', 'Windows-PC', fakeDate);

    assert.equal(conflictTitle, '分布式系统设计 (冲突备份-Windows-PC-20261014-2115)');
  });

  it('空标题回落到「未命名文章」而不是产生空串', () => {
    const title = formatConflictTitle('   ', 'Linux', new Date(2026, 0, 1, 0, 0));
    assert.equal(title, '未命名文章 (冲突备份-Linux-20260101-0000)');
  });

  it('正确生成符合 RFC 7617 的 HTTP Basic Auth 认证头', () => {
    const header = buildBasicAuthHeader('testuser@jianguoyun.com', 'mypassword123');
    assert.ok(header.startsWith('Basic '));

    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    assert.equal(decoded, 'testuser@jianguoyun.com:mypassword123');
  });

  it('Basic Auth 支持非 ASCII 账号（中文用户名按 UTF-8 编码）', () => {
    const header = buildBasicAuthHeader('张三', '密码123');
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    assert.equal(decoded, '张三:密码123');
  });
});

describe('Three-Way Merge Coordinator Decision Matrix', () => {
  const base = { rev: 1, checksum: 'hash_v1', updatedAt: 1000 };

  it('场景 1：仅本地修改时，决策为 PUSH_UPDATE', () => {
    const decision = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'hash_v2',
      remoteItem: { rev: 1, checksum: 'hash_v1', updatedAt: 1000 },
      baseItem: base,
    });

    assert.equal(decision.action, 'PUSH_UPDATE');
  });

  it('场景 2：仅远端修改时，决策为 PULL_UPDATE', () => {
    const decision = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'hash_v1',
      remoteItem: { rev: 2, checksum: 'hash_v2', updatedAt: 2000 },
      baseItem: base,
    });

    assert.equal(decision.action, 'PULL_UPDATE');
  });

  it('场景 3：双端并发修改且哈希不同时，坚决触发 CONFLICT_BACKUP 保护机制', () => {
    const decision = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'hash_local_v2',
      remoteItem: { rev: 2, checksum: 'hash_remote_v2', updatedAt: 2000 },
      baseItem: base,
    });

    assert.equal(decision.action, 'CONFLICT_BACKUP');
  });

  it('场景 4：本地删除文章时，生成 PUSH_TOMBSTONE 软删除', () => {
    const decision = decideThreeWayAction({
      hasLocal: false,
      localChecksum: undefined,
      remoteItem: { rev: 1, checksum: 'hash_v1', updatedAt: 1000 },
      baseItem: base,
    });

    assert.equal(decision.action, 'PUSH_TOMBSTONE');
  });

  it('场景 4b：本地删除但远端已改过，改为 PULL_DELETE_CONFLICT 保内容', () => {
    const decision = decideThreeWayAction({
      hasLocal: false,
      remoteItem: { rev: 2, checksum: 'hash_remote_new', updatedAt: 2000 },
      baseItem: base,
    });

    assert.equal(decision.action, 'PULL_DELETE_CONFLICT');
  });

  it('场景 5：远端标记墓碑删除且本地未修改时，决策为 DELETE_LOCAL', () => {
    const decision = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'hash_v1',
      remoteItem: { rev: 2, checksum: '', isDeleted: true, updatedAt: 2000 },
      baseItem: base,
    });

    assert.equal(decision.action, 'DELETE_LOCAL');
  });

  it('场景 5b：远端墓碑删除但本地又改过，决策为 REVIVE_AND_PUSH', () => {
    const decision = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'hash_local_changed',
      remoteItem: { rev: 2, checksum: '', isDeleted: true, updatedAt: 2000 },
      baseItem: base,
    });

    assert.equal(decision.action, 'REVIVE_AND_PUSH');
  });

  it('场景 6：本地新文章首次同步时，决策为 PUSH_NEW', () => {
    const decision = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'hash_new',
      remoteItem: undefined,
      baseItem: undefined,
    });

    assert.equal(decision.action, 'PUSH_NEW');
  });

  it('场景 6b：本地无、远端也无的幽灵 ID -> NOOP', () => {
    const decision = decideThreeWayAction({ hasLocal: false });
    assert.equal(decision.action, 'NOOP');
  });

  it('场景 7：两端内容哈希一致时，静默 NOOP，无需多余网络 IO', () => {
    const decision = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'hash_same',
      remoteItem: { rev: 2, checksum: 'hash_same', updatedAt: 3000 },
      baseItem: { rev: 1, checksum: 'hash_old', updatedAt: 1000 },
    });

    assert.equal(decision.action, 'NOOP');
  });

  it('每个决策都必须带人类可读的 reason，便于同步日志排查', () => {
    const decision = decideThreeWayAction({
      hasLocal: true,
      localChecksum: 'a',
      remoteItem: { rev: 1, checksum: 'b', updatedAt: 1 },
      baseItem: { rev: 1, checksum: 'c', updatedAt: 1 },
    });
    assert.equal(typeof decision.reason, 'string');
    assert.ok(decision.reason.length > 0);
  });
});
