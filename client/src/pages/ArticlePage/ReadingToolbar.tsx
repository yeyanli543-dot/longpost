import { Minus, Plus, Sun, Moon, List } from 'lucide-react';
import type { ThemeMode, FontSize } from '@shared/api.interface';

interface ReadingToolbarProps {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

export default function ReadingToolbar({
  fontSize,
  setFontSize,
  theme,
  setTheme,
}: ReadingToolbarProps) {
  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('sepia');
    else setTheme('light');
  };
  const nextThemeLabel = theme === 'light' ? '深色' : theme === 'dark' ? '暖色' : '浅色';

  const decreaseFont = () => {
    if (fontSize === 'xlarge') setFontSize('large');
    else if (fontSize === 'large') setFontSize('medium');
    else if (fontSize === 'medium') setFontSize('small');
  };

  const increaseFont = () => {
    if (fontSize === 'small') setFontSize('medium');
    else if (fontSize === 'medium') setFontSize('large');
    else if (fontSize === 'large') setFontSize('xlarge');
  };

  return (
    <div className="mb-6 flex items-center gap-1 rounded-xl bg-card border border-border p-1" role="toolbar" aria-label="阅读设置">
      <span className="pl-3 pr-2 text-xs font-medium text-muted-foreground">阅读设置</span>
      <button
         onClick={decreaseFont}
         disabled={fontSize === 'small'}
         className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-muted transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
         aria-label="减小字号"
         title="减小字号"
         data-ai-section-type="button"
       >
         <Minus className="w-4 h-4 md:w-[18px] md:h-[18px] text-foreground" />
       </button>
       <button
         onClick={increaseFont}
         disabled={fontSize === 'xlarge'}
         className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-muted transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
         aria-label="增大字号"
         title="增大字号"
         data-ai-section-type="button"
       >
         <Plus className="w-4 h-4 md:w-[18px] md:h-[18px] text-foreground" />
       </button>
       <div className="h-5 w-px bg-border mx-1" aria-hidden="true" />
       <button
         onClick={toggleTheme}
         className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
         aria-label={`切换为${nextThemeLabel}主题`}
         title={`切换为${nextThemeLabel}主题`}
         data-ai-section-type="button"
       >
         {theme === 'dark' ? (
           <Sun className="w-4 h-4 md:w-[18px] md:h-[18px] text-foreground" />
         ) : (
           <Moon className="w-4 h-4 md:w-[18px] md:h-[18px] text-foreground" />
         )}
       </button>
       <button
         onClick={() => {
           const el = document.getElementById('comments-section');
           el?.scrollIntoView({ behavior: 'smooth' });
         }}
         className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
         aria-label="跳转到评论区"
         title="跳转到评论区"
         data-ai-section-type="button"
       >
         <List className="w-4 h-4 md:w-[18px] md:h-[18px] text-foreground" />
       </button>
    </div>
  );
}
