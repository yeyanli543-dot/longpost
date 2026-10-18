/**
 * 邮件发送。
 *
 * 三条通道，按 MAIL_PROVIDER 选择：
 *   - console：开发/自测用，只把邮件打进日志，不真的发出去
 *   - resend ：HTTP API，一个 key 就能用，适合没有自建邮件的部署
 *   - smtp   ：任意 SMTP 服务（企业邮箱、Mailgun、自建 Postfix…）
 *
 * 设计取舍：发送失败**不抛异常**，只记日志并返回 false。
 * 订阅推送是后台任务，一封失败不该让整批中断，更不该把错误冒到用户面前。
 */

import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type MailProvider = 'console' | 'resend' | 'smtp';

@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);
  private transporter: Transporter | null = null;

  get provider(): MailProvider {
    const raw = (process.env.MAIL_PROVIDER || '').trim().toLowerCase();
    if (raw === 'resend' || raw === 'smtp' || raw === 'console') return raw;
    // 没配就自动判断：有 SMTP 主机就当 smtp，有 Resend key 就当 resend，否则 console
    if (process.env.SMTP_HOST) return 'smtp';
    if (process.env.RESEND_API_KEY) return 'resend';
    return 'console';
  }

  get from(): string {
    return (process.env.MAIL_FROM || '').trim() || 'LongPost <no-reply@localhost>';
  }

  /** 是否已经能真的发信（console 也算"配置完成"，只是不外发） */
  get configured(): boolean {
    const p = this.provider;
    if (p === 'resend') return Boolean(process.env.RESEND_API_KEY);
    if (p === 'smtp') return Boolean(process.env.SMTP_HOST);
    return true;
  }

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST;
    if (!host) return null;

    const port = Number(process.env.SMTP_PORT || 587);
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465 || process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
    });
    return this.transporter;
  }

  async send(message: MailMessage): Promise<boolean> {
    const provider = this.provider;

    if (provider === 'console') {
      this.logger.log('[console] 邮件未外发 -> ' + message.to + ' | ' + message.subject);
      return true;
    }

    try {
      if (provider === 'resend') return await this.sendViaResend(message);
      return await this.sendViaSmtp(message);
    } catch (error) {
      this.logger.error('发送邮件失败: ' + message.to + ' | ' + String((error as Error)?.message || error));
      return false;
    }
  }

  private async sendViaResend(message: MailMessage): Promise<boolean> {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      this.logger.warn('MAIL_PROVIDER=resend 但缺少 RESEND_API_KEY');
      return false;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error('Resend 返回 ' + res.status + ': ' + detail.slice(0, 200));
      return false;
    }
    return true;
  }

  private async sendViaSmtp(message: MailMessage): Promise<boolean> {
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.warn('MAIL_PROVIDER=smtp 但缺少 SMTP_HOST');
      return false;
    }

    await transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return true;
  }
}
