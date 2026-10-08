import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { chartCardToEchartsOption, chartHeight, type ChartCard } from '@shared/chart-card';

interface ChartBlockProps {
  card: ChartCard;
  theme?: 'light' | 'dark';
}

/**
 * 应用内的图表渲染。与公开阅读页（服务端直出）共用同一份 option 生成逻辑，
 * 所以同一条图表在站内和分享页上长得一模一样。
 */
export default function ChartBlock({ card, theme = 'dark' }: ChartBlockProps) {
  const option = useMemo(() => chartCardToEchartsOption(card, theme), [card, theme]);

  return (
    <div
      className="my-6 w-full rounded-md border border-[#2f3336] bg-[#0a0a0a] p-2"
      style={{ height: chartHeight(card) }}
    >
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
