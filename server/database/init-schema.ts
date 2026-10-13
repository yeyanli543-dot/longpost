import type postgres from 'postgres';

/**
 * 数据库初始化模式定义（纯原生幂等 DDL，无需安装任何外部迁移工具）。
 * 当应用连接到全新的 PostgreSQL 实例时，自动完成枚举复合类型与全部 25 张业务表的建表。
 */
export async function initDatabaseSchema(sql: postgres.Sql): Promise<void> {
  // 1. 复合类型
  await sql`
    DO $$ BEGIN
      CREATE TYPE user_profile AS (user_id text);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `.simple().catch(() => {});

  await sql`
    DO $$ BEGIN
      CREATE TYPE file_attachment AS (bucket_id text, file_path text);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `.simple().catch(() => {});

  // 2. 核心用户与权限表
  await sql`
    CREATE TABLE IF NOT EXISTS app_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      nickname VARCHAR(100) NOT NULL,
      avatar_url TEXT,
      provider VARCHAR(50) NOT NULL DEFAULT 'email',
      provider_id VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_login_at TIMESTAMPTZ(3),
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      bio VARCHAR(500),
      notify_on_read BOOLEAN NOT NULL DEFAULT true,
      notify_on_delete BOOLEAN NOT NULL DEFAULT true,
      theme VARCHAR(20) NOT NULL DEFAULT 'dark',
      font_size VARCHAR(20) NOT NULL DEFAULT 'medium',
      follower_count INTEGER NOT NULL DEFAULT 0,
      following_count INTEGER NOT NULL DEFAULT 0,
      is_banned BOOLEAN NOT NULL DEFAULT false,
      ban_reason VARCHAR(500),
      banned_at TIMESTAMPTZ(3),
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
  `.simple().catch(() => {});

  // 3. 通行码与访问日志表
  await sql`
    CREATE TABLE IF NOT EXISTS access_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(32) NOT NULL UNIQUE,
      nickname VARCHAR(100) NOT NULL,
      username VARCHAR(100),
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      avatar_url TEXT,
      bio VARCHAR(500),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      expires_at TIMESTAMPTZ(6),
      max_uses INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMPTZ(6),
      note VARCHAR(500),
      app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      created_by UUID,
      fail_count INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ(6),
      _created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS access_code_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      access_code_id UUID NOT NULL REFERENCES access_codes(id) ON DELETE CASCADE,
      ip_address VARCHAR(64),
      user_agent TEXT,
      success BOOLEAN NOT NULL DEFAULT true,
      error_reason VARCHAR(100),
      logged_in_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      _created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `.simple().catch(() => {});

  // 4. 文章与短帖体系
  await sql`
    CREATE TABLE IF NOT EXISTS articles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      excerpt VARCHAR(500),
      coverUrl TEXT,
      read_count INTEGER NOT NULL DEFAULT 0,
      author user_profile NOT NULL,
      app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      repost_count INTEGER NOT NULL DEFAULT 0,
      bookmark_count INTEGER NOT NULL DEFAULT 0,
      is_pinned BOOLEAN NOT NULL DEFAULT false,
      is_featured BOOLEAN NOT NULL DEFAULT false,
      moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved',
      pinned_at TIMESTAMPTZ(6),
      featured_at TIMESTAMPTZ(6),
      reject_reason VARCHAR(500),
      slug VARCHAR(12) UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'published',
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content VARCHAR(280) NOT NULL,
      article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
      author user_profile NOT NULL,
      app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      repost_count INTEGER NOT NULL DEFAULT 0,
      is_pinned BOOLEAN NOT NULL DEFAULT false,
      is_featured BOOLEAN NOT NULL DEFAULT false,
      moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved',
      pinned_at TIMESTAMPTZ(6),
      featured_at TIMESTAMPTZ(6),
      reject_reason VARCHAR(500),
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS article_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      file_name VARCHAR(255) NOT NULL,
      file_url TEXT NOT NULL,
      file_size BIGINT,
      file_type VARCHAR(100),
      sort_order INTEGER NOT NULL DEFAULT 0,
      app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS article_images (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      app_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
  `.simple().catch(() => {});

  // 5. 互动关系表
  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      content_type VARCHAR(20) NOT NULL,
      content_id UUID NOT NULL,
      parent_id UUID REFERENCES comments(id) ON DELETE SET NULL,
      body VARCHAR(500) NOT NULL,
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      like_count INTEGER NOT NULL DEFAULT 0,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS comment_likes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile,
      UNIQUE(user_id, comment_id)
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS likes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      content_type VARCHAR(20) NOT NULL,
      content_id UUID NOT NULL,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile,
      UNIQUE(user_id, content_type, content_id)
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile,
      UNIQUE(user_id, article_id)
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS reposts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      content_type VARCHAR(20) NOT NULL,
      content_id UUID NOT NULL,
      quote_content VARCHAR(280),
      is_quote BOOLEAN NOT NULL DEFAULT false,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile,
      UNIQUE(user_id, content_type, content_id)
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS follows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      follower_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      following_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile,
      UNIQUE(follower_id, following_id)
    );
  `.simple().catch(() => {});

  // 6. 话题与通知
  await sql`
    CREATE TABLE IF NOT EXISTS hashtags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tag VARCHAR(100) NOT NULL UNIQUE,
      post_count INTEGER NOT NULL DEFAULT 0,
      article_count INTEGER NOT NULL DEFAULT 0,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS content_hashtags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      hashtag_id UUID NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
      content_type VARCHAR(20) NOT NULL,
      content_id UUID NOT NULL,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile,
      UNIQUE(hashtag_id, content_type, content_id)
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL,
      actor_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      content_type VARCHAR(20),
      content_id UUID,
      comment_id UUID REFERENCES comments(id) ON DELETE SET NULL,
      is_read BOOLEAN NOT NULL DEFAULT false,
      metadata JSONB,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
  `.simple().catch(() => {});

  // 7. 会议与私信
  await sql`
    CREATE TABLE IF NOT EXISTS meetings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(200) NOT NULL,
      description TEXT,
      start_time TIMESTAMPTZ(3) NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      is_public BOOLEAN NOT NULL DEFAULT false,
      meeting_code VARCHAR(20) NOT NULL UNIQUE,
      creator_id UUID NOT NULL REFERENCES app_users(id),
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS meeting_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES app_users(id),
      status VARCHAR(20) NOT NULL DEFAULT 'invited',
      joined_at TIMESTAMPTZ(3),
      left_at TIMESTAMPTZ(3),
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(meeting_id, user_id)
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS meeting_chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES app_users(id),
      content TEXT NOT NULL,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS meeting_minutes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS dm_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS dm_conversation_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      last_read_at TIMESTAMPTZ(3),
      deleted_at TIMESTAMPTZ(3),
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(conversation_id, user_id)
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS dm_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `.simple().catch(() => {});

  // 8. 站点设置与举报
  await sql`
    CREATE TABLE IF NOT EXISTS site_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_name VARCHAR(100) NOT NULL DEFAULT 'LongPost',
      site_description VARCHAR(500),
      site_logo_url TEXT,
      allow_register BOOLEAN NOT NULL DEFAULT true,
      google_login_enabled BOOLEAN NOT NULL DEFAULT true,
      site_announcement VARCHAR(500),
      content_moderation_enabled BOOLEAN NOT NULL DEFAULT false,
      registration_mode VARCHAR(50) NOT NULL DEFAULT 'google_only',
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
  `.simple().catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reporter_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      content_type VARCHAR(20) NOT NULL,
      content_id UUID NOT NULL,
      reason VARCHAR(50) NOT NULL,
      description VARCHAR(500),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      handler_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      handled_at TIMESTAMPTZ(3),
      _created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
  `.simple().catch(() => {});
}
