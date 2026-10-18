import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTableConfig } from 'drizzle-orm/pg-core';

// 直接读取生产 Drizzle schema —— 以前这个文件在测试里"模拟"一个假数据库再断言它自己，
// 没有任何回归价值；现在改为校验真实表结构的完整性约束。
import {
  appUsers,
  articles,
  bookmarks,
  comments,
  follows,
  likes,
} from '../server/database/schema.ts';

/** 取某张表上指定名字的索引配置 */
function findIndex(table, name) {
  const cfg = getTableConfig(table);
  return cfg.indexes.find((i) => i.config.name === name);
}

/** 索引列名（逗号拼接，便于断言顺序） */
function indexColumns(index) {
  return index.config.columns.map((c) => c.name).join(',');
}

/** 索引是否唯一 */
function isUnique(index) {
  return Boolean(index && index.config.unique);
}

/** 表上的外键（按名字查） */
function findForeignKey(table, name) {
  const cfg = getTableConfig(table);
  return cfg.foreignKeys.find((fk) => fk.getName() === name);
}

function onDeleteAction(fk) {
  const action = fk && fk.onDelete;
  return typeof action === 'string' ? action : undefined;
}

function columnNames(table) {
  return getTableConfig(table).columns.map((c) => c.name);
}

describe('Data Integrity & Polymorphic Cascade Regression Suite', () => {
  it('点赞必须由 (user, content_type, content_id) 唯一索引兜底，杜绝并发重复点赞', () => {
    const idx = findIndex(likes, 'idx_likes_user_content');
    assert.ok(idx, '缺少 idx_likes_user_content');
    assert.equal(isUnique(idx), true, '点赞去重索引必须是 UNIQUE');
    assert.equal(indexColumns(idx), 'user_id,content_type,content_id');
  });

  it('关注关系必须唯一，且两端用户删除时级联清理', () => {
    const idx = findIndex(follows, 'idx_follows_follower_following');
    assert.equal(isUnique(idx), true);
    assert.equal(indexColumns(idx), 'follower_id,following_id');

    assert.equal(onDeleteAction(findForeignKey(follows, 'follows_follower_id_fkey')), 'cascade');
    assert.equal(onDeleteAction(findForeignKey(follows, 'follows_following_id_fkey')), 'cascade');
  });

  it('收藏必须唯一，文章删除后收藏记录随之级联删除', () => {
    const idx = findIndex(bookmarks, 'idx_bookmarks_user_article');
    assert.equal(isUnique(idx), true);
    assert.equal(indexColumns(idx), 'user_id,article_id');
    assert.equal(onDeleteAction(findForeignKey(bookmarks, 'bookmarks_article_id_fkey')), 'cascade');
  });

  it('评论支持楼中楼：parent_id 可空、有索引，父评论删除时置空而不是连带删子评论', () => {
    const cols = columnNames(comments);
    assert.ok(cols.includes('parent_id'), '缺少 parent_id 列');

    const parentIdx = findIndex(comments, 'idx_comments_parent');
    assert.ok(parentIdx, 'parent_id 必须有索引，否则楼中楼查询会全表扫描');

    const fk = findForeignKey(comments, 'comments_parent_id_fkey');
    assert.ok(fk, '缺少 parent_id 外键');
    assert.equal(onDeleteAction(fk), 'set null', '父评论被删时子评论应保留并置空 parent_id');
  });

  it('评论删除必须按 (content_type, content_id) 建索引，多条评论按时间排序', () => {
    const idx = findIndex(comments, 'idx_comments_content');
    assert.ok(idx);
    assert.equal(indexColumns(idx), 'content_type,content_id,_created_at');
  });

  it('文章 slug 必须全局唯一（免登录分享短链的基石）', () => {
    const idx = findIndex(articles, 'idx_articles_slug');
    assert.equal(isUnique(idx), true);
  });

  it('用户表必须保留 token_version / password_hash / is_banned 等鉴权关键列', () => {
    const cols = columnNames(appUsers);
    for (const required of ['password_hash', 'token_version', 'is_banned', 'is_active', 'role']) {
      assert.ok(cols.includes(required), `app_users 缺少关键列 ${required}`);
    }
  });

  it('计数字段必须有默认值 0，避免 null 参与算术运算', () => {
    const cfg = getTableConfig(appUsers);
    const followerCount = cfg.columns.find((c) => c.name === 'follower_count');
    assert.ok(followerCount, 'app_users 缺少 follower_count');
    assert.equal(followerCount.notNull, true, '计数列应为 NOT NULL');
    assert.ok(followerCount.default !== undefined, '计数列应有默认值');
  });
});
