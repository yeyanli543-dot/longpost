/**
 * 图表卡片 —— 与项目里 shared/chart-card.ts 完全一致的 ```chart 围栏格式。
 *
 * 正文里这样写：
 *   ```chart
 *   { "type": "bar", "title": "月度阅读量", "xAxis": ["1月","2月"], "series": [{ "name": "阅读", "data": [12, 30] }] }
 *   ```
 *
 * 本文件是纯函数、环境无关：渲染进程用它画图，主进程用它做导出。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LPChart = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_CHART_HEIGHT = 360;
  const CHART_TYPES = ['bar', 'line', 'area', 'pie'];
  const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;
  const PALETTE = [
    '#3b82f6',
    '#22c55e',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#ec4899',
    '#eab308',
  ];

  const TYPE_LABELS = { bar: '柱状图', line: '折线图', area: '面积图', pie: '饼图' };

  function asFiniteNumber(value) {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  }

  function normalizeCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw;
    const type = String(obj.type == null ? '' : obj.type).toLowerCase();
    if (CHART_TYPES.indexOf(type) === -1) return null;

    const card = { type: type };
    if (typeof obj.title === 'string' && obj.title.trim()) {
      card.title = obj.title.trim().slice(0, 200);
    }
    const h = asFiniteNumber(obj.height);
    if (h !== null && h >= 200 && h <= 800) card.height = Math.round(h);

    if (type === 'pie') {
      const data = [];
      if (Array.isArray(obj.data)) {
        for (const d of obj.data) {
          if (!d) continue;
          const value = asFiniteNumber(d.value);
          if (value === null) continue;
          data.push({ name: d.name != null ? String(d.name) : '', value: value });
        }
      }
      if (!data.length) return null;
      card.data = data;
      return card;
    }

    const xAxis = Array.isArray(obj.xAxis) ? obj.xAxis.map((x) => String(x)) : [];
    const series = [];
    if (Array.isArray(obj.series)) {
      for (const s of obj.series) {
        if (!s || !Array.isArray(s.data)) continue;
        const nums = s.data.map(asFiniteNumber);
        if (nums.some((n) => n === null)) continue;
        series.push({ name: s.name != null ? String(s.name) : undefined, data: nums });
      }
    }
    if (!series.length) return null;
    card.xAxis = xAxis;
    card.series = series;
    return card;
  }

  function parseChartCard(json) {
    try {
      return normalizeCard(JSON.parse(json));
    } catch {
      return null;
    }
  }

  function encodeChartCard(card) {
    return '```chart\n' + JSON.stringify(card, null, 2) + '\n```';
  }

  /** 把含图表围栏的 Markdown 切成 markdown / chart 段。 */
  function splitChartCards(markdown) {
    const lines = String(markdown == null ? '' : markdown).split('\n');
    const segments = [];
    let mdBuf = [];

    const flushMd = () => {
      if (mdBuf.length) {
        segments.push({ kind: 'markdown', text: mdBuf.join('\n') });
        mdBuf = [];
      }
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const m = line.match(FENCE_RE);
      if (!m) {
        mdBuf.push(line);
        i += 1;
        continue;
      }

      const marker = m[2][0];
      const markerLen = m[2].length;
      const info = m[3].trim();
      const lang = (info.split(/\s+/)[0] || '').toLowerCase();

      let closedAt = -1;
      for (let j = i + 1; j < lines.length; j += 1) {
        const cm = lines[j].match(FENCE_RE);
        if (cm && cm[2][0] === marker && cm[2].length >= markerLen && cm[3].trim() === '') {
          closedAt = j;
          break;
        }
      }

      if (closedAt === -1) {
        mdBuf.push.apply(mdBuf, lines.slice(i));
        break;
      }

      const body = lines.slice(i + 1, closedAt).join('\n');
      if (lang === 'chart') {
        const card = parseChartCard(body);
        flushMd();
        if (card) {
          segments.push({ kind: 'chart', text: body, card: card });
        } else {
          mdBuf.push.apply(mdBuf, lines.slice(i, closedAt + 1));
        }
      } else {
        mdBuf.push.apply(mdBuf, lines.slice(i, closedAt + 1));
      }
      i = closedAt + 1;
    }

    flushMd();
    return segments;
  }

  function chartCount(markdown) {
    return splitChartCards(markdown).filter((s) => s.kind === 'chart').length;
  }

  function chartHeight(card) {
    return (card && card.height) || DEFAULT_CHART_HEIGHT;
  }

  /** 图表卡片 -> 完整 ECharts option。 */
  function chartCardToEchartsOption(card, theme) {
    const dark = theme !== 'light';
    const text = dark ? '#e5e7eb' : '#111827';
    const subText = dark ? '#9ca3af' : '#6b7280';
    const split = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const axisLine = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';

    const hasTitle = !!card.title;
    const multi = (card.series && card.series.length) > 1;

    const base = {
      color: PALETTE,
      title: hasTitle
        ? {
            text: card.title,
            left: 'center',
            top: 8,
            textStyle: { fontSize: 15, fontWeight: 600, color: text },
          }
        : undefined,
      tooltip: { trigger: card.type === 'pie' ? 'item' : 'axis' },
      grid: {
        left: 12,
        right: 20,
        top: hasTitle ? (multi ? 54 : 42) : multi ? 38 : 26,
        bottom: 28,
        containLabel: true,
      },
    };
    if (multi) {
      base.legend = { top: hasTitle ? 32 : 6, textStyle: { color: subText } };
    }

    const categoryAxis = (data, boundary) => ({
      type: 'category',
      data: data,
      boundaryGap: boundary,
      axisLine: { lineStyle: { color: axisLine } },
      axisTick: { show: false },
      axisLabel: { color: subText },
    });
    const valueAxis = {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: split } },
      axisLabel: { color: subText },
    };

    if (card.type === 'pie') {
      return {
        color: PALETTE,
        title: base.title,
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 4, textStyle: { color: subText } },
        series: [
          {
            type: 'pie',
            radius: ['38%', '66%'],
            center: ['50%', '46%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 6,
              borderColor: dark ? '#111827' : '#ffffff',
              borderWidth: 2,
            },
            label: { color: subText, formatter: '{b}: {d}%' },
            data: card.data || [],
          },
        ],
      };
    }

    const mapped = (card.series || []).map((s) => ({
      name: s.name,
      type: 'line',
      data: s.data,
      smooth: true,
      ...(card.type === 'area' ? { areaStyle: { opacity: dark ? 0.3 : 0.18 } } : {}),
      ...(card.type === 'line' || card.type === 'area' ? {} : {}),
    }));

    if (card.type === 'line' || card.type === 'area') {
      return {
        ...base,
        xAxis: categoryAxis(card.xAxis || [], false),
        yAxis: valueAxis,
        series: mapped,
      };
    }

    return {
      ...base,
      xAxis: categoryAxis(card.xAxis || [], true),
      yAxis: valueAxis,
      series: (card.series || []).map((s) => ({
        name: s.name,
        type: 'bar',
        data: s.data,
        barMaxWidth: 42,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      })),
    };
  }

  /** 新建图表时的默认卡片，让对话框一打开就有东西可看。 */
  function sampleCard(type) {
    const t = CHART_TYPES.indexOf(type) === -1 ? 'bar' : type;
    if (t === 'pie') {
      return {
        type: 'pie',
        title: '内容构成',
        data: [
          { name: '技术', value: 42 },
          { name: '随笔', value: 28 },
          { name: '读书', value: 18 },
          { name: '其他', value: 12 },
        ],
        height: DEFAULT_CHART_HEIGHT,
      };
    }
    return {
      type: t,
      title: '月度数据',
      xAxis: ['1月', '2月', '3月', '4月', '5月', '6月'],
      series: [{ name: '数值', data: [120, 200, 150, 80, 170, 240] }],
      height: DEFAULT_CHART_HEIGHT,
    };
  }

  return {
    DEFAULT_CHART_HEIGHT: DEFAULT_CHART_HEIGHT,
    CHART_TYPES: CHART_TYPES,
    TYPE_LABELS: TYPE_LABELS,
    PALETTE: PALETTE,
    parseChartCard: parseChartCard,
    encodeChartCard: encodeChartCard,
    splitChartCards: splitChartCards,
    chartCount: chartCount,
    chartHeight: chartHeight,
    chartCardToEchartsOption: chartCardToEchartsOption,
    sampleCard: sampleCard,
  };
});
