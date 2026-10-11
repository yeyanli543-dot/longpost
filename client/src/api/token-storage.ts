import { logger } from '@/lib/logger';

const TOKEN_KEY = 'longpost_auth_token';
const COOKIE_TOKEN_KEY = 'longpost_token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(
      new RegExp('(^|;\\s*)' + name + '=([^;]*)'),
    );
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, maxAgeSec: number): void {
  try {
    const attrs = [
      `path=/`,
      `max-age=${maxAgeSec}`,
      `SameSite=Lax`,
    ];
    document.cookie = `${name}=${encodeURIComponent(value)}; ${attrs.join('; ')}`;
  } catch (err) {
    logger.error('写入 cookie 失败', err);
  }
}

function removeCookie(name: string): void {
  try {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  } catch (err) {
    logger.error('清除 cookie 失败', err);
  }
}

function readFromLocalStorage(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToLocalStorage(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    logger.error('写入 localStorage 失败', err);
  }
}

function clearLocalStorage(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    logger.error('清除 localStorage 失败', err);
  }
}

function readFromSessionStorage(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToSessionStorage(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    logger.error('写入 sessionStorage 失败', err);
  }
}

function clearSessionStorage(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    logger.error('清除 sessionStorage 失败', err);
  }
}

let recoveredTokenCache: string | null = null;
let recoveryDone = false;

export function getToken(): string | null {
  const ls = readFromLocalStorage();
  if (ls) return ls;

  if (recoveryDone && recoveredTokenCache) return recoveredTokenCache;

  const ss = readFromSessionStorage();
  if (ss) {
    logger.info('[auth-recovery] 从 sessionStorage 恢复 token');
    writeToLocalStorage(ss);
    writeCookie(COOKIE_TOKEN_KEY, ss, COOKIE_MAX_AGE);
    recoveredTokenCache = ss;
    recoveryDone = true;
    return ss;
  }

  const ck = readCookie(COOKIE_TOKEN_KEY);
  if (ck) {
    logger.info('[auth-recovery] 从 cookie 恢复 token');
    writeToLocalStorage(ck);
    writeToSessionStorage(ck);
    recoveredTokenCache = ck;
    recoveryDone = true;
    return ck;
  }

  recoveryDone = true;
  recoveredTokenCache = null;
  return null;
}

export function setToken(token: string): void {
  writeToLocalStorage(token);
  writeToSessionStorage(token);
  writeCookie(COOKIE_TOKEN_KEY, token, COOKIE_MAX_AGE);
  recoveredTokenCache = token;
  recoveryDone = true;
}

export function clearToken(): void {
  clearLocalStorage();
  clearSessionStorage();
  removeCookie(COOKIE_TOKEN_KEY);
  recoveredTokenCache = null;
  recoveryDone = true;
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
