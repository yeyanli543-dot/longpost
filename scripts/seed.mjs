import 'dotenv/config';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUDA_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/longpost';

const sql = postgres(connectionString, {
  ssl: process.env.POSTGRES_SSL === 'true' ? 'require' : false,
  max: 5,
  connect_timeout: 10,
});

async function runSeed() {
  console.log('🌱 正在连接数据库准备执行数据播种 (Seeder)...');
  console.log(`   目标数据源: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);

  try {
    // 1. 检查或创建默认管理员与创作者账号
    const passwordHash = await bcrypt.hash('admin123456', 10);
    const creatorHash = await bcrypt.hash('creator123456', 10);

    const existingUsers = await sql`
      SELECT id, email, role FROM app_users WHERE email IN ('admin@longpost.dev', 'architect@longpost.dev', 'designer@longpost.dev')
    `;

    const userMap = new Map();
    for (const u of existingUsers) {
      userMap.set(u.email, u.id);
    }

    if (!userMap.has('admin@longpost.dev')) {
      const [admin] = await sql`
        INSERT INTO app_users (
          email, password_hash, nickname, bio, role, is_active, theme, font_size
        ) VALUES (
          'admin@longpost.dev',
          ${passwordHash},
          'LongPost 官方团队',
          '探索现代化长文排版、双工作区架构与知识工程系统',
          'admin',
          true,
          'dark',
          'medium'
        ) RETURNING id;
      `;
      userMap.set('admin@longpost.dev', admin.id);
      console.log('   ✅ 创建管理员账号: admin@longpost.dev (密码: admin123456)');
    }

    if (!userMap.has('architect@longpost.dev')) {
      const [architect] = await sql`
        INSERT INTO app_users (
          email, password_hash, nickname, bio, role, is_active, theme, font_size
        ) VALUES (
          'architect@longpost.dev',
          ${creatorHash},
          '老张架构笔记',
          '专注于全栈工程治理、跨端架构演进与零延迟风控体系',
          'user',
          true,
          'dark',
          'medium'
        ) RETURNING id;
      `;
      userMap.set('architect@longpost.dev', architect.id);
      console.log('   ✅ 创建创作者账号: architect@longpost.dev (密码: creator123456)');
    }

    const adminId = userMap.get('admin@longpost.dev');
    const architectId = userMap.get('architect@longpost.dev');

    // 2. 检查或播种精选长文
    const existingArticles = await sql`
      SELECT id FROM articles WHERE slug = 'fullstack-architecture-evolution'
    `;

    if (existingArticles.length === 0) {
      const articleContent = `# 全栈重构实战：从双轨架构走向统一客户端体系

> [!NOTE]
> 本文探讨如何通过统一 React 表现层与平台适配层（Platform Abstraction Layer），彻底终结跨端代码割裂。

## 1. 架构演进全景

\`\`\`mermaid
flowchart TD
  UI["统一前端 React 表现层"] --> Adapter["跨端平台抽象层 (PAL)"]
  Adapter --> Web["Web 浏览器 (REST/WS)"]
  Adapter --> Desktop["Electron 桌面端 (IPC/FS)"]
  Adapter --> Mobile["Capacitor 移动端 (IndexedDB)"]
\`\`\`

## 2. 核心数学模型与效能衡量

根据全生命周期研发效能方程：
$$\\text{Efficiency} = \\frac{K \\cdot \\text{Features}}{N_{\\text{Platforms}} \\times \\Delta t}$$

当平台维护份数 $N=1$ 时，团队在功能交付与安全漏洞治理上的边际成本将锐降 60% 以上。

## 3. 为什么需要双工作区设计？

- **🍏 Apple 禅意版**：去分割线留白、底部悬浮灵动胶囊 Dock、Squircle 超大圆角、沉浸式白纸黑字写作；
- **🔷 Google 专业版**：Material Design 3 紧凑工具箱、横向药丸导航抽屉、浮动操作按钮（FAB）。

按 \`Alt+M\` 即可在两种灵魂骨相之间自如切换。`;

      const [article] = await sql`
        INSERT INTO articles (
          title, content, excerpt, slug, status, author, app_user_id, moderation_status
        ) VALUES (
          '全栈重构实战：从双轨架构走向统一客户端体系',
          ${articleContent},
          '深度解析 LongPost 统一表现层架构、双工作区骨相分化以及 DFA 敏感词风控引擎实战。',
          'fullstack-architecture-evolution',
          'published',
          ${architectId},
          ${architectId},
          'approved'
        ) RETURNING id;
      `;
      console.log(`   ✅ 创建演示长文: 全栈重构实战 (ID: ${article.id})`);

      // 播种配套短帖
      await sql`
        INSERT INTO posts (
          content, author, app_user_id, article_id, moderation_status
        ) VALUES (
          '深度复盘：我们如何用纯代码重构彻底统一 LongPost 的 Web 与 Electron 端？附完整 Mermaid 架构推演图与研发效能公式。#架构设计 #性能优化 #LongPost',
          ${architectId},
          ${architectId},
          ${article.id},
          'approved'
        );
      `;
    }

    // 3. 播种常用短帖与讨论
    const postCount = await sql`SELECT count(*)::int as count FROM posts`;
    if (postCount[0].count < 3) {
      await sql`
        INSERT INTO posts (content, author, app_user_id, moderation_status) VALUES
        ('LongPost v3.0.0 正式发布！已全面引入【极简】与【专业】双工作区切换机制，全局快捷键 Alt+M 即时换肤。#LongPost #架构设计', ${adminId}, ${adminId}, 'approved'),
        ('现在长文内的所有 Mermaid 流程图与时序图，都已支持一键导出为 2x 视网膜超清 PNG，粘贴进公众号与排版工具零毛边！#性能优化', ${architectId}, ${architectId}, 'approved'),
        ('移动端挖孔屏动态安全区已调通，打孔屏/刘海屏均享受像素级贴边避让与平滑留白。#体验升级', ${adminId}, ${adminId}, 'approved');
      `;
      console.log('   ✅ 播种精选动态短帖');
    }

    // 4. 播种热门标签
    const tagList = ['LongPost', '架构设计', '性能优化', '体验升级', 'Web前端'];
    for (const tag of tagList) {
      await sql`
        INSERT INTO hashtags (name, post_count, article_count)
        VALUES (${tag}, 2, 1)
        ON CONFLICT (name) DO NOTHING;
      `;
    }
    console.log('   ✅ 同步常用热门标签');

    // 5. 播种测试通用通行码
    const testCode = 'LONGPOST2026TEST';
    const codeHash = await bcrypt.hash(testCode, 10);
    const existingCode = await sql`SELECT id FROM access_codes WHERE code = ${codeHash}`;
    if (existingCode.length === 0) {
      await sql`
        INSERT INTO access_codes (
          code, note, max_uses, current_uses, role, is_active, created_by
        ) VALUES (
          ${codeHash},
          '2026 本地开发与体验测试通用通行码',
          1000,
          0,
          'user',
          true,
          ${adminId}
        );
      `;
      console.log(`   ✅ 创建通用测试通行码: ${testCode} (可用 1000 次)`);
    }

    console.log('\n🎉 数据库播种完成！所有测试用户、演示长文、动态流与标签已就绪。');
  } catch (err) {
    console.error('❌ 数据库播种失败:', err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

runSeed();
