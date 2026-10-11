import React, { useMemo } from 'react';
import { Calendar, Flame, PenLine, FileText, Sparkles } from 'lucide-react';
import dayjs from 'dayjs';

interface WritingHeatmapProps {
  dates?: string[]; // ISO string 日期数组
  totalWords?: number;
  articleCount?: number;
}

export const WritingHeatmap: React.FC<WritingHeatmapProps> = ({
  dates = [],
  totalWords = 0,
  articleCount = 0,
}) => {
  // 生成过去 180 天的日历格子
  const { grid, maxCount, streak, activeDays } = useMemo(() => {
    const countsMap = new Map<string, number>();
    dates.forEach((d) => {
      const dayKey = dayjs(d).format('YYYY-MM-DD');
      countsMap.set(dayKey, (countsMap.get(dayKey) || 0) + 1);
    });

    const today = dayjs();
    const daysToShow = 140; // 约 20 周
    const days: Array<{ date: string; count: number; dayOfWeek: number }> = [];

    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;

    for (let i = daysToShow - 1; i >= 0; i--) {
      const cur = today.subtract(i, 'day');
      const dateStr = cur.format('YYYY-MM-DD');
      const count = countsMap.get(dateStr) || 0;
      days.push({
        date: dateStr,
        count,
        dayOfWeek: cur.day(),
      });

      if (count > 0) {
        tempStreak++;
        if (tempStreak > maxStreak) maxStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }

    // 计算当前连续打卡
    let checkDay = today;
    while (true) {
      const key = checkDay.format('YYYY-MM-DD');
      if (countsMap.get(key) && countsMap.get(key)! > 0) {
        currentStreak++;
        checkDay = checkDay.subtract(1, 'day');
      } else {
        break;
      }
    }

    let max = 1;
    countsMap.forEach((v) => {
      if (v > max) max = v;
    });

    return {
      grid: days,
      maxCount: max,
      streak: Math.max(currentStreak, maxStreak),
      activeDays: countsMap.size,
    };
  }, [dates]);

  // 根据频次获取颜色阶梯
  const getColor = (count: number) => {
    if (count === 0) return 'bg-muted/40 hover:bg-muted/80 border-border/20';
    if (count === 1) return 'bg-emerald-500/30 hover:bg-emerald-500/50 border-emerald-500/40';
    if (count === 2) return 'bg-emerald-500/60 hover:bg-emerald-500/80 border-emerald-500/60';
    return 'bg-emerald-500 hover:bg-emerald-400 border-emerald-400 text-white shadow-sm';
  };

  return (
    <div className="p-5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xl shadow-lg select-none">
      {/* 顶部指标卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-background/60 border border-border/60">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span>发布文章</span>
          </div>
          <div className="text-xl font-bold text-foreground">{articleCount || dates.length} <span className="text-xs font-normal text-muted-foreground">篇</span></div>
        </div>

        <div className="p-3 rounded-xl bg-background/60 border border-border/60">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <PenLine className="w-3.5 h-3.5 text-blue-400" />
            <span>累计字数</span>
          </div>
          <div className="text-xl font-bold text-foreground">
            {totalWords > 10000 ? `${(totalWords / 10000).toFixed(1)}w` : totalWords} <span className="text-xs font-normal text-muted-foreground">字</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-background/60 border border-border/60">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>创作天数</span>
          </div>
          <div className="text-xl font-bold text-foreground">{activeDays} <span className="text-xs font-normal text-muted-foreground">天</span></div>
        </div>

        <div className="p-3 rounded-xl bg-background/60 border border-border/60">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            <span>连续打卡</span>
          </div>
          <div className="text-xl font-bold text-orange-500">{streak} <span className="text-xs font-normal text-muted-foreground">天</span></div>
        </div>
      </div>

      {/* 热力图格子 */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1 min-w-[560px]">
          {Array.from({ length: Math.ceil(grid.length / 7) }).map((_, colIdx) => (
            <div key={`col-${colIdx}`} className="flex flex-col gap-1">
              {grid.slice(colIdx * 7, colIdx * 7 + 7).map((item) => (
                <div
                  key={item.date}
                  className={`w-3 h-3 rounded-sm border transition-all cursor-pointer ${getColor(item.count)}`}
                  title={`${item.date}：${item.count ? `发布了 ${item.count} 篇长文` : '无创作记录'}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 底部图例说明 */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border/40">
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-emerald-500" />
          <span>持续创作让思考更有价值</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>少</span>
          <div className="w-2.5 h-2.5 rounded-sm bg-muted/40 border border-border/40" />
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-500/40" />
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60 border border-emerald-500/60" />
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-emerald-400" />
          <span>多</span>
        </div>
      </div>
    </div>
  );
};
