import { useState, useEffect } from 'react';
import { Minus, Plus, Sun, Moon, List } from 'lucide-react';

type FontSize = 'small' | 'medium' | 'large';
type Theme = 'dark' | 'light';

interface ReadingToolbarProps {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export default function ReadingToolbar({
  fontSize,
  setFontSize,
  theme,
  setTheme,
}: ReadingToolbarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 200);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const decreaseFont = () => {
    if (fontSize === 'large') setFontSize('medium');
    else if (fontSize === 'medium') setFontSize('small');
  };

  const increaseFont = () => {
    if (fontSize === 'small') setFontSize('medium');
    else if (fontSize === 'medium') setFontSize('large');
  };

  return (
    <div
       className={`fixed right-3 md:right-4 top-20 z-40 flex flex-col gap-2 md:gap-1 p-2 md:p-1.5 rounded-full bg-[#16181c] border border-[#2f3336] transition-opacity duration-300 ${
         visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
       }`}
     >
      <button
         onClick={decreaseFont}
         disabled={fontSize === 'small'}
         className="h-11 w-11 md:h-auto md:w-auto md:p-2 flex items-center justify-center rounded-full hover:bg-[#2f3336] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
         aria-label="减小字号"
         title="减小字号"
         data-ai-section-type="button"
       >
         <Minus className="w-4 h-4 md:w-[18px] md:h-[18px] text-[#e7e9ea]" />
       </button>
       <button
         onClick={increaseFont}
         disabled={fontSize === 'large'}
         className="h-11 w-11 md:h-auto md:w-auto md:p-2 flex items-center justify-center rounded-full hover:bg-[#2f3336] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
         aria-label="增大字号"
         title="增大字号"
         data-ai-section-type="button"
       >
         <Plus className="w-4 h-4 md:w-[18px] md:h-[18px] text-[#e7e9ea]" />
       </button>
       <div className="w-full h-px bg-[#2f3336] my-1 md:my-0.5" />
       <button
         onClick={toggleTheme}
         className="h-11 w-11 md:h-auto md:w-auto md:p-2 flex items-center justify-center rounded-full hover:bg-[#2f3336] transition-colors"
         aria-label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
         title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
         data-ai-section-type="button"
       >
         {theme === 'dark' ? (
           <Sun className="w-4 h-4 md:w-[18px] md:h-[18px] text-[#e7e9ea]" />
         ) : (
           <Moon className="w-4 h-4 md:w-[18px] md:h-[18px] text-[#e7e9ea]" />
         )}
       </button>
       <button
         onClick={() => {
           const el = document.getElementById('comments-section');
           el?.scrollIntoView({ behavior: 'smooth' });
         }}
         className="h-11 w-11 md:h-auto md:w-auto md:p-2 flex items-center justify-center rounded-full hover:bg-[#2f3336] transition-colors"
         aria-label="目录"
         title="目录（跳转到评论区）"
         data-ai-section-type="button"
       >
         <List className="w-4 h-4 md:w-[18px] md:h-[18px] text-[#e7e9ea]" />
       </button>
    </div>
  );
}
