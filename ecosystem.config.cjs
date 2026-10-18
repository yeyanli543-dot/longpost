/**
 * PM2 生产配置
 *
 * ⚠️ 必须单实例（instances: 1）。
 * 站内私信、会议信令走 Socket.IO，没有装 @socket.io/redis-adapter 时，
 * 多实例之间的房间与广播是割裂的 —— 表现为"消息有时收不到、会议里看不到人"。
 * 真要多核，先接 Redis adapter，再把 instances 改成 max。
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs longpost
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'longpost',
      script: 'dist/server/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '800M',
      // 只让 PM2 重启异常退出；正常退出（比如发版时手动 stop）不拉起
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
        SERVER_HOST: '0.0.0.0',
        SERVER_PORT: 3000,
      },
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
