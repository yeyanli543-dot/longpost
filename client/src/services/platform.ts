/**
 * Platform Abstraction Layer (跨端适配门面)
 *
 * 统一抽象 Web 端、Electron 桌面端 (通过 window.lp 桥接) 以及 Capacitor 移动端环境。
 * 遵循策略模式为业务层提供一致的平台服务接口，消灭多端代码双轨维护。
 */

export type PlatformType = 'web' | 'desktop' | 'mobile';

export interface PlatformCapabilities {
  hasFileSystem: boolean;
  hasNativeClipboard: boolean;
  hasPushNotifications: boolean;
  hasBiometrics: boolean;
}

export interface IPlatformService {
  readonly type: PlatformType;
  readonly isDesktop: boolean;
  readonly isMobile: boolean;
  readonly isWeb: boolean;
  readonly capabilities: PlatformCapabilities;

  getAppVersion(): Promise<string>;
  copyToClipboard(text: string): Promise<boolean>;
  readFromClipboard(): Promise<string>;
  showNotification(title: string, options?: NotificationOptions): Promise<boolean>;
  openExternalUrl(url: string): Promise<void>;
}

class WebPlatformService implements IPlatformService {
  readonly type: PlatformType = 'web';
  readonly isDesktop = false;
  readonly isMobile = false;
  readonly isWeb = true;

  readonly capabilities: PlatformCapabilities = {
    hasFileSystem: false,
    hasNativeClipboard: typeof navigator !== 'undefined' && 'clipboard' in navigator,
    hasPushNotifications: typeof window !== 'undefined' && 'Notification' in window,
    hasBiometrics: false,
  };

  async getAppVersion(): Promise<string> {
    return '2.7.4';
  }

  async copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async readFromClipboard(): Promise<string> {
    try {
      if (navigator.clipboard) {
        return await navigator.clipboard.readText();
      }
      return '';
    } catch {
      return '';
    }
  }

  async showNotification(title: string, options?: NotificationOptions): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
      new Notification(title, options);
      return true;
    }
    return false;
  }

  async openExternalUrl(url: string): Promise<void> {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}

class DesktopPlatformService implements IPlatformService {
  readonly type: PlatformType = 'desktop';
  readonly isDesktop = true;
  readonly isMobile = false;
  readonly isWeb = false;

  readonly capabilities: PlatformCapabilities = {
    hasFileSystem: true,
    hasNativeClipboard: true,
    hasPushNotifications: true,
    hasBiometrics: false,
  };

  private get lp(): any {
    return (typeof window !== 'undefined' ? (window as any).lp : null);
  }

  async getAppVersion(): Promise<string> {
    try {
      const info = await this.lp?.appInfo?.();
      return info?.version || '2.7.4';
    } catch {
      return '2.7.4';
    }
  }

  async copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async readFromClipboard(): Promise<string> {
    try {
      if (navigator.clipboard) {
        return await navigator.clipboard.readText();
      }
      return '';
    } catch {
      return '';
    }
  }

  async showNotification(title: string, options?: NotificationOptions): Promise<boolean> {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      new Notification(title, options);
      return true;
    }
    return false;
  }

  async openExternalUrl(url: string): Promise<void> {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}

function detectPlatform(): IPlatformService {
  if (typeof window !== 'undefined' && (window as any).lp) {
    return new DesktopPlatformService();
  }
  return new WebPlatformService();
}

export const platform: IPlatformService = detectPlatform();
