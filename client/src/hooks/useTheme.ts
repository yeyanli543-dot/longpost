import { useEffect, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import type { ThemeMode, FontSize } from '@shared/api.interface';

export type { ThemeMode, FontSize };

export type AccentColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'pink'
  | 'orange'
  | 'amber'
  | 'cyan'
  | 'mono';

export type FontFamily = 'sans' | 'serif' | 'mono';
export type LineHeight = 'compact' | 'normal' | 'relaxed';
export type BorderRadius = 'sharp' | 'default' | 'round';
export type NotchMode = 'auto' | 'punch-hole' | 'island' | 'compact';

export interface SafeAreaMeasurements {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const THEME_KEY = 'app-theme-preference';
const ACCENT_KEY = 'app-accent-preference';
const FONT_KEY = 'app-font-preference';
const FONT_SIZE_KEY = 'app-fontsize-preference';
const LINE_HEIGHT_KEY = 'app-lineheight-preference';
const RADIUS_KEY = 'app-radius-preference';
const NOTCH_KEY = 'app-notch-mode';
const LANDSCAPE_KEY = 'app-notch-landscape';

export type ResolvedTheme =
  | 'light'
  | 'dark'
  | 'oled'
  | 'sepia'
  | 'nord'
  | 'forest'
  | 'lavender';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

function applyThemeClasses(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.remove(
    'light-mode',
    'dark-mode',
    'dark',
    'theme-oled',
    'theme-sepia',
    'theme-nord',
    'theme-forest',
    'theme-lavender',
  );

  if (resolved === 'light') {
    root.classList.add('light-mode');
  } else if (resolved === 'sepia') {
    root.classList.add('theme-sepia');
  } else {
    root.classList.add('dark-mode', 'dark');
    if (resolved === 'oled') root.classList.add('theme-oled');
    else if (resolved === 'nord') root.classList.add('theme-nord');
    else if (resolved === 'forest') root.classList.add('theme-forest');
    else if (resolved === 'lavender') root.classList.add('theme-lavender');
  }
}

function applyAccentClass(accent: AccentColor): void {
  const root = document.documentElement;
  const accents: AccentColor[] = ['blue', 'green', 'purple', 'pink', 'orange', 'amber', 'cyan', 'mono'];
  accents.forEach((a) => root.classList.remove(`accent-${a}`));
  root.classList.add(`accent-${accent}`);
}

function applyFontClass(font: FontFamily): void {
  const root = document.documentElement;
  root.classList.remove('font-pref-sans', 'font-pref-serif', 'font-pref-mono');
  root.classList.add(`font-pref-${font}`);
}

function applyFontSizeClass(size: FontSize): void {
  const root = document.documentElement;
  root.classList.remove('font-size-small', 'font-size-medium', 'font-size-large', 'font-size-xlarge');
  root.classList.add(`font-size-${size}`);
}

function applyLineHeightClass(lh: LineHeight): void {
  const root = document.documentElement;
  root.classList.remove('line-height-compact', 'line-height-normal', 'line-height-relaxed');
  root.classList.add(`line-height-${lh}`);
}

function applyRadiusClass(radius: BorderRadius): void {
  const root = document.documentElement;
  root.classList.remove('radius-sharp', 'radius-default', 'radius-round');
  root.classList.add(`radius-${radius}`);
}

function applyNotchClasses(mode: NotchMode, landscapeGuard: boolean): void {
  const root = document.documentElement;
  root.classList.remove('notch-punch-hole', 'notch-island', 'notch-compact');
  if (mode !== 'auto') {
    root.classList.add(`notch-${mode}`);
  }

  if (landscapeGuard) {
    root.classList.add('notch-landscape-guard');
  } else {
    root.classList.remove('notch-landscape-guard');
  }
}

function measureSafeArea(): SafeAreaMeasurements {
  if (typeof window === 'undefined' || !document.body) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  try {
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '0';
    el.style.height = '0';
    el.style.paddingTop = 'var(--safe-area-inset-top)';
    el.style.paddingBottom = 'var(--safe-area-inset-bottom)';
    el.style.paddingLeft = 'var(--safe-area-inset-left)';
    el.style.paddingRight = 'var(--safe-area-inset-right)';
    el.style.visibility = 'hidden';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    const cs = window.getComputedStyle(el);
    const top = Math.round(parseFloat(cs.paddingTop) || 0);
    const bottom = Math.round(parseFloat(cs.paddingBottom) || 0);
    const left = Math.round(parseFloat(cs.paddingLeft) || 0);
    const right = Math.round(parseFloat(cs.paddingRight) || 0);
    document.body.removeChild(el);
    return { top, bottom, left, right };
  } catch {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    return saved ?? 'dark';
  });

  const [accent, setAccentState] = useState<AccentColor>(() => {
    if (typeof window === 'undefined') return 'blue';
    const saved = localStorage.getItem(ACCENT_KEY) as AccentColor | null;
    return saved ?? 'blue';
  });

  const [fontFamily, setFontFamilyState] = useState<FontFamily>(() => {
    if (typeof window === 'undefined') return 'sans';
    const saved = localStorage.getItem(FONT_KEY) as FontFamily | null;
    return saved ?? 'sans';
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    if (typeof window === 'undefined') return 'medium';
    const saved = localStorage.getItem(FONT_SIZE_KEY) as FontSize | null;
    return saved ?? 'medium';
  });

  const [lineHeight, setLineHeightState] = useState<LineHeight>(() => {
    if (typeof window === 'undefined') return 'normal';
    const saved = localStorage.getItem(LINE_HEIGHT_KEY) as LineHeight | null;
    return saved ?? 'normal';
  });

  const [borderRadius, setBorderRadiusState] = useState<BorderRadius>(() => {
    if (typeof window === 'undefined') return 'default';
    const saved = localStorage.getItem(RADIUS_KEY) as BorderRadius | null;
    return saved ?? 'default';
  });

  const [notchMode, setNotchModeState] = useState<NotchMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    const saved = localStorage.getItem(NOTCH_KEY) as NotchMode | null;
    return saved ?? 'auto';
  });

  const [landscapeGuard, setLandscapeGuardState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(LANDSCAPE_KEY);
    return saved !== 'false';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(theme),
  );

  const [safeArea, setSafeArea] = useState<SafeAreaMeasurements>(() =>
    measureSafeArea(),
  );

  // 测量安全区高度
  const refreshSafeArea = useCallback(() => {
    setSafeArea(measureSafeArea());
  }, []);

  // 主题模式响应
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyThemeClasses(resolved);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      logger.error('保存主题偏好失败', err);
    }
  }, [theme]);

  // 跟随系统监听
  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent): void => {
      const resolved = e.matches ? 'light' : 'dark';
      setResolvedTheme(resolved);
      applyThemeClasses(resolved);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  // 强调色响应
  useEffect(() => {
    applyAccentClass(accent);
    try {
      localStorage.setItem(ACCENT_KEY, accent);
    } catch (err) {
      logger.error('保存强调色失败', err);
    }
  }, [accent]);

  // 字体响应
  useEffect(() => {
    applyFontClass(fontFamily);
    try {
      localStorage.setItem(FONT_KEY, fontFamily);
    } catch (err) {
      logger.error('保存字体偏好失败', err);
    }
  }, [fontFamily]);

  // 字号响应
  useEffect(() => {
    applyFontSizeClass(fontSize);
    try {
      localStorage.setItem(FONT_SIZE_KEY, fontSize);
    } catch (err) {
      logger.error('保存字号偏好失败', err);
    }
  }, [fontSize]);

  // 行距响应
  useEffect(() => {
    applyLineHeightClass(lineHeight);
    try {
      localStorage.setItem(LINE_HEIGHT_KEY, lineHeight);
    } catch (err) {
      logger.error('保存行距偏好失败', err);
    }
  }, [lineHeight]);

  // 圆角响应
  useEffect(() => {
    applyRadiusClass(borderRadius);
    try {
      localStorage.setItem(RADIUS_KEY, borderRadius);
    } catch (err) {
      logger.error('保存圆角偏好失败', err);
    }
  }, [borderRadius]);

  // 挖孔屏模式响应
  useEffect(() => {
    applyNotchClasses(notchMode, landscapeGuard);
    try {
      localStorage.setItem(NOTCH_KEY, notchMode);
      localStorage.setItem(LANDSCAPE_KEY, String(landscapeGuard));
    } catch (err) {
      logger.error('保存挖孔屏偏好失败', err);
    }
    // 延迟一帧测量安全区实际像素
    const timer = setTimeout(refreshSafeArea, 50);
    return () => clearTimeout(timer);
  }, [notchMode, landscapeGuard, refreshSafeArea]);

  // 屏幕旋转或视口变化时重新测量安全区
  useEffect(() => {
    const handleResize = () => refreshSafeArea();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [refreshSafeArea]);

  const setTheme = (mode: ThemeMode): void => setThemeState(mode);
  const setAccent = (acc: AccentColor): void => setAccentState(acc);
  const setFontFamily = (font: FontFamily): void => setFontFamilyState(font);
  const setFontSize = (size: FontSize): void => setFontSizeState(size);
  const setLineHeight = (lh: LineHeight): void => setLineHeightState(lh);
  const setBorderRadius = (radius: BorderRadius): void => setBorderRadiusState(radius);
  const setNotchMode = (mode: NotchMode): void => setNotchModeState(mode);
  const setLandscapeGuard = (guard: boolean): void => setLandscapeGuardState(guard);

  const resetToDefaults = (): void => {
    setThemeState('dark');
    setAccentState('blue');
    setFontFamilyState('sans');
    setFontSizeState('medium');
    setLineHeightState('normal');
    setBorderRadiusState('default');
    setNotchModeState('auto');
    setLandscapeGuardState(true);
  };

  return {
    theme,
    setTheme,
    accent,
    setAccent,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    lineHeight,
    setLineHeight,
    borderRadius,
    setBorderRadius,
    notchMode,
    setNotchMode,
    landscapeGuard,
    setLandscapeGuard,
    resolvedTheme,
    safeArea,
    refreshSafeArea,
    resetToDefaults,
  };
}
