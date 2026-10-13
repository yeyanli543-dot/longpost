/**
 * 图表卡片（ChartCard）的共享定义。
 *
 * 一份格式，三处复用：
 *  - 编辑器：把图表序列化成下面的 ```chart 围栏块写进正文；
 *  - 公开阅读页（服务端直出 HTML）：解析围栏块，输出 echarts 容器；
 *  - 应用内阅读页（React）：解析围栏块，用 echarts 渲染。
 *
 * 之所以放进 shared/ 而不是两边各写一份：格式一旦漂移，
 * 就会出现"编辑器里好好的，分享页上图表没了"这类最难查的问题。
 */

export type ChartCardType = 'bar' | 'line' | 'area' | 'pie';

export interface ChartSeries {
  name?: string;
  data: number[];
}

export interface ChartPieDatum {
  name: string;
  value: number;
}

export interface ChartCard {
  type: ChartCardType;
  title?: string;
  /** 直角坐标系（bar / line / area）的类目轴 */
  xAxis?: string[];
  /** 直角坐标系的数据列 */
  series?: ChartSeries[];
  /** 饼图的数据 */
  data?: ChartPieDatum[];
  /** 渲染高度（像素），会被夹在 200–800 之间 */
  height?: number;
}

export const CHART_FENCE_LANGUAGE = 'chart';
export const CHART_DEFAULT_HEIGHT = 360;
export const CHART_MIN_HEIGHT = 200;
export const CHART_MAX_HEIGHT = 800;

/** 匹配 ```chart 围栏块（必须独占整行，避免误伤正文里的行内反引号） */
const CHART_FENCE_PATTERN = '^[ \\t]*```chart[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n[ \\t]*```[ \\t]*$';

export interface MarkdownSegment {
  kind: 'markdown';
  content: string;
}

export interface ChartSegment {
  kind: 'chart';
  card: ChartCard;
  raw: string;
}

export interface InvalidChartSegment {
  kind: 'invalid-chart';
  raw: string;
}

export type ContentSegment = MarkdownSegment | ChartSegment | InvalidChartSegment;

function normalizeHeight(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return CHART_DEFAULT_HEIGHT;
  return Math.min(CHART_MAX_HEIGHT, Math.max(CHART_MIN_HEIGHT, Math.round(n)));
}

/**
 * 解析一个围栏块的块体。任何不合法的情况都返回 null，
 * 由调用方决定降级方式（React 端提示、服务端原样保留为代码块）。
 */
export function parseChartCard(text: string): ChartCard | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const raw = parsed as Record<string, unknown>;
  const type = raw.type;
  if (type !== 'bar' && type !== 'line' && type !== 'area' && type !== 'pie') return null;

  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title : undefined;
  const height = normalizeHeight(raw.height);

  if (type === 'pie') {
    const source = Array.isArray(raw.data) ? raw.data : [];
    const points: ChartPieDatum[] = [];
    for (const entry of source) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      const name = typeof item.name === 'string' ? item.name : String(item.name ?? '');
      const value = Number(item.value);
      if (!name || !Number.isFinite(value)) continue;
      points.push({ name, value });
    }
    if (points.length === 0) return null;
    return { type, title, height, data: points };
  }

  const xAxis = Array.isArray(raw.xAxis) ? raw.xAxis.map((v) => String(v ?? '')) : [];
  if (xAxis.length === 0) return null;

  const seriesSource = Array.isArray(raw.series) ? raw.series : [];
  const series: ChartSeries[] = [];
  for (const entry of seriesSource) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const values = Array.isArray(item.data) ? item.data : [];
    const data: number[] = [];
    for (const v of values) {
      const n = Number(v);
      if (Number.isFinite(n)) data.push(n);
    }
    if (data.length === 0) continue;
    series.push({
      name: typeof item.name === 'string' && item.name.trim() ? item.name : undefined,
      data,
    });
  }
  if (series.length === 0) return null;

  return { type, title, height, xAxis, series };
}

/** 把图表卡片序列化成可写进正文的围栏块 */
export function encodeChartCard(card: ChartCard): string {
  return `\`\`\`${CHART_FENCE_LANGUAGE}\n${JSON.stringify(card, null, 2)}\n\`\`\``;
}

/**
 * 按图表围栏块把正文切成若干段。
 * 返回顺序即原始顺序，调用方按段渲染即可无损还原排版。
 */
export function splitChartCards(markdown: string): ContentSegment[] {
  const source = markdown ?? '';
  const segments: ContentSegment[] = [];
  const re = new RegExp(CHART_FENCE_PATTERN, 'gm');

  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source)) !== null) {
    if (match.index > cursor) {
      segments.push({ kind: 'markdown', content: source.slice(cursor, match.index) });
    }
    const raw = match[1] ?? '';
    const card = parseChartCard(raw);
    segments.push(card ? { kind: 'chart', card, raw } : { kind: 'invalid-chart', raw });
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    segments.push({ kind: 'markdown', content: source.slice(cursor) });
  }

  if (segments.length === 0) {
    segments.push({ kind: 'markdown', content: source });
  }

  return segments;
}

/** 正文里的图表数量 */
export function chartCount(markdown: string): number {
  return splitChartCards(markdown).filter((s) => s.kind === 'chart').length;
}

/** 图表实际渲染高度 */
export function chartHeight(card: ChartCard): number {
  return normalizeHeight(card.height);
}

/** 直角坐标系里一条数据列的样式 */
function buildSeries(card: ChartCard): Record<string, unknown>[] {
  const isArea = card.type === 'area';
  return (card.series ?? []).map((s) => ({
    name: s.name,
    type: isArea ? 'line' : card.type,
    data: s.data,
    smooth: card.type === 'line' || isArea,
    areaStyle: isArea ? { opacity: 0.25 } : undefined,
    itemStyle: card.type === 'bar' ? { borderRadius: [6, 6, 0, 0] } : undefined,
    barMaxWidth: 32,
    emphasis: { focus: 'series' },
  }));
}

/**
 * 把图表卡片转成 echarts 的 option。
 * 服务端直出与 React 端共用这一份，保证两侧长得一模一样。
 */
export function chartCardToEchartsOption(
  card: ChartCard,
  theme: 'light' | 'dark' = 'light',
): Record<string, unknown> {
  const dark = theme === 'dark';
  const textColor = dark ? '#e7e9ea' : '#0f1419';
  const subTextColor = dark ? '#8b98a5' : '#536471';
  const axisLineColor = dark ? '#2f3336' : '#e5e7eb';
  const splitLineColor = dark ? '#2f3336' : '#eef0f2';

  const modernPalette = dark
    ? ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#34d399', '#fbbf24']
    : ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#0284c7'];

  const multiSeries = (card.series?.length ?? 0) > 1;
  const hasTitle = Boolean(card.title);

  const base: Record<string, unknown> = {
    backgroundColor: 'transparent',
    color: modernPalette,
    textStyle: { color: textColor, fontFamily: 'system-ui, -apple-system, sans-serif' },
    tooltip: { trigger: card.type === 'pie' ? 'item' : 'axis' },
  };
  if (card.title) {
    base.title = {
      text: card.title,
      left: 0,
      top: 0,
      textStyle: { color: textColor, fontSize: 14, fontWeight: 'normal' },
    };
  }

  if (card.type === 'pie') {
    return {
      ...base,
      legend: { bottom: 0, textStyle: { color: subTextColor } },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', hasTitle ? '54%' : '50%'],
          itemStyle: {
            borderRadius: 6,
            borderColor: dark ? '#18181b' : '#ffffff',
            borderWidth: 2,
          },
          data: card.data ?? [],
          label: { color: textColor },
          labelLine: { lineStyle: { color: axisLineColor } },
        },
      ],
    };
  }

  const gridTop = hasTitle ? (multiSeries ? 68 : 46) : multiSeries ? 32 : 16;

  return {
    ...base,
    grid: { left: 4, right: 16, top: gridTop, bottom: 4, containLabel: true },
    legend: multiSeries
      ? { top: hasTitle ? 24 : 0, textStyle: { color: subTextColor } }
      : undefined,
    xAxis: {
      type: 'category',
      data: card.xAxis ?? [],
      axisLine: { lineStyle: { color: axisLineColor } },
      axisTick: { show: false },
      axisLabel: { color: subTextColor },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: subTextColor },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    series: buildSeries(card),
  };
}
