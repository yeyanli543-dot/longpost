import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  X,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Sun,
  Moon,
  Presentation,
} from 'lucide-react';
import { Markdown } from '@client/src/components/ui/markdown';
import { splitChartCards } from '@shared/chart-card';
import ChartBlock from '@client/src/components/ChartBlock';
import { MermaidRenderer } from '../MermaidRenderer';
import { splitSlides } from '@shared/text/slides';

interface SlidePresenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

export const SlidePresenterModal: React.FC<SlidePresenterModalProps> = ({
  isOpen,
  onClose,
  title,
  content,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // 演讲者计时器
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // 控制条自动隐藏
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 切分幻灯片
  const slides = useMemo(() => splitSlides(content), [content]);
  const totalSlides = slides.length;

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setCurrentSlideIndex(0);
      setTimerSeconds(0);
      setIsTimerRunning(true);
      setShowControls(true);
    }
  }, [isOpen]);

  // 计时器轮询
  useEffect(() => {
    if (!isOpen || !isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isTimerRunning]);

  // 格式化计时器
  const formattedTime = useMemo(() => {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    const seconds = timerSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }, [timerSeconds]);

  // 控制条鼠标活动激活与自动隐藏
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3200);
  }, []);

  // 翻页操作
  const goToNext = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.min(prev + 1, totalSlides - 1));
  }, [totalSlides]);

  const goToPrev = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch {
      // ignore
    }
  };

  // 键盘快捷键监听
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentSlideIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentSlideIndex(totalSlides - 1);
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goToNext, goToPrev, onClose, totalSlides]);

  if (!isOpen) return null;

  const currentSlideContent = slides[currentSlideIndex] || '';

  // 渲染幻灯片内部结构（含图表与 Mermaid）
  const renderSlideContent = (rawText: string) => {
    const segments = splitChartCards(rawText);
    return segments.map((seg, idx) => {
      if (seg.kind === 'chart') {
        return (
          <div key={`chart-${idx}`} className="w-full my-4 flex justify-center">
            <div className="w-full max-w-4xl scale-95 md:scale-100 transition-transform">
              <ChartBlock card={seg.card} />
            </div>
          </div>
        );
      }
      if (seg.kind === 'invalid-chart') {
        return (
          <pre key={`err-chart-${idx}`} className="my-2 p-2 rounded bg-red-500/10 text-red-400 text-xs">
            <code>{seg.raw}</code>
          </pre>
        );
      }

      const parts = seg.content.split(/(```mermaid[\s\S]*?```)/g);
      return (
        <div key={`seg-${idx}`} className="w-full">
          {parts.map((part, pIdx) => {
            if (part.startsWith('```mermaid') && part.endsWith('```')) {
              const code = part.replace(/^```mermaid\s*/, '').replace(/```$/, '').trim();
              return (
                <div key={`mermaid-${pIdx}`} className="my-4 flex justify-center scale-95 md:scale-105">
                  <MermaidRenderer chart={code} />
                </div>
              );
            }
            if (!part.trim()) return null;
            return (
              <Markdown
                key={`md-${pIdx}`}
                className={`prose ${
                  theme === 'dark' ? 'prose-invert' : 'prose-neutral'
                } max-w-none text-lg md:text-2xl leading-relaxed [&>h1]:text-3xl md:[&>h1]:text-5xl [&>h1]:font-black [&>h1]:mb-6 [&>h1]:tracking-tight [&>h2]:text-2xl md:[&>h2]:text-4xl [&>h2]:font-bold [&>h2]:mb-4 [&>p]:my-4 [&>ul]:my-4 [&>li]:my-2 [&>pre]:text-base md:[&>pre]:text-lg [&>pre]:my-4 [&>blockquote]:text-xl [&>table]:text-base md:[&>table]:text-xl`}
              >
                {part}
              </Markdown>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`fixed inset-0 z-50 flex flex-col select-none overflow-hidden transition-colors duration-300 ${
        theme === 'dark' ? 'bg-[#0f1117] text-[#e2e8f0]' : 'bg-[#f8f9fa] text-[#1a1b1e]'
      }`}
    >
      {/* 顶部隐式浮动控制栏 */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 px-6 py-4 flex items-center justify-between transition-opacity duration-300 backdrop-blur-md ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${
          theme === 'dark'
            ? 'bg-black/40 border-b border-white/10 text-white'
            : 'bg-white/70 border-b border-black/10 text-gray-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
            <Presentation className="w-5 h-5" />
          </span>
          <div>
            <h4 className="text-sm font-semibold truncate max-w-md">{title || '未命名演说'}</h4>
            <p className="text-[11px] opacity-60">Marp 投影演说模式 · 按 F 全屏 · 空格/方向键翻页</p>
          </div>
        </div>

        {/* 计时器与操作 */}
        <div className="flex items-center gap-3">
          {/* 计时器 */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/30 dark:bg-white/10 border border-white/10 text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>{formattedTime}</span>
            <button
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className="p-1 hover:text-white transition-colors"
              title={isTimerRunning ? '暂停计时' : '继续计时'}
            >
              {isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>
            <button
              onClick={() => setTimerSeconds(0)}
              className="p-1 hover:text-white transition-colors"
              title="重置计时器"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* 主题切换 */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title="切换明暗背景"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* 全屏切换 */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title={isFullscreen ? '退出全屏' : '投影全屏模式 (F)'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* 关闭退出 */}
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
            title="退出演说模式 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 幻灯片主体核心展示区（自适应 16:9 铺满居中） */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-12 relative overflow-hidden">
        {/* 16:9 投影视窗卡片 */}
        <div
          className={`relative w-full max-w-6xl aspect-16/10 md:aspect-16/9 rounded-3xl p-8 md:p-16 shadow-2xl flex flex-col justify-center items-center overflow-y-auto transition-all duration-300 border ${
            theme === 'dark'
              ? 'bg-[#161822] border-white/5 shadow-black/80'
              : 'bg-white border-black/5 shadow-gray-300'
          }`}
        >
          {/* 页码微标 */}
          <div className="absolute top-6 right-8 text-xs font-mono opacity-30 tracking-widest uppercase">
            {currentSlideIndex + 1} / {totalSlides}
          </div>

          <div className="w-full flex-1 flex flex-col justify-center items-start text-left max-w-4xl mx-auto">
            {renderSlideContent(currentSlideContent)}
          </div>
        </div>

        {/* 左右侧翻页点击热区 */}
        <button
          onClick={goToPrev}
          disabled={currentSlideIndex === 0}
          className={`absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full backdrop-blur-md transition-all ${
            showControls ? 'opacity-80 hover:opacity-100 hover:scale-110' : 'opacity-0 pointer-events-none'
          } ${
            theme === 'dark' ? 'bg-white/10 text-white' : 'bg-black/10 text-gray-800'
          } disabled:opacity-10 disabled:pointer-events-none`}
          title="上一页 (←)"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <button
          onClick={goToNext}
          disabled={currentSlideIndex === totalSlides - 1}
          className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full backdrop-blur-md transition-all ${
            showControls ? 'opacity-80 hover:opacity-100 hover:scale-110' : 'opacity-0 pointer-events-none'
          } ${
            theme === 'dark' ? 'bg-white/10 text-white' : 'bg-black/10 text-gray-800'
          } disabled:opacity-10 disabled:pointer-events-none`}
          title="下一页 (→ / 空格)"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* 底部浮动控制条与进度条 */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 backdrop-blur-md ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${
          theme === 'dark'
            ? 'bg-black/40 border-t border-white/10 text-white'
            : 'bg-white/70 border-t border-black/10 text-gray-800'
        }`}
      >
        {/* 顶部进度条 */}
        <div className="w-full h-1 bg-white/10 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${((currentSlideIndex + 1) / totalSlides) * 100}%` }}
          />
        </div>

        <div className="px-6 py-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">
              第 {currentSlideIndex + 1} 页 / 共 {totalSlides} 页
            </span>
          </div>

          {/* 幻灯片点状进度导航 */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-md py-1">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlideIndex(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === currentSlideIndex
                    ? 'w-6 bg-blue-500'
                    : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
                title={`跳转至第 ${idx + 1} 页`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goToPrev}
              disabled={currentSlideIndex === 0}
              className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 transition-colors"
            >
              上一页
            </button>
            <button
              onClick={goToNext}
              disabled={currentSlideIndex === totalSlides - 1}
              className="px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-20 transition-colors font-medium"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
