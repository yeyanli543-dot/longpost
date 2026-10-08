import { useMemo, useState } from 'react';
import {
  BarChart3,
  LineChart,
  PieChart,
  Plus,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import ChartBlock from '@client/src/components/ChartBlock';
import {
  CHART_DEFAULT_HEIGHT,
  CHART_MAX_HEIGHT,
  CHART_MIN_HEIGHT,
  encodeChartCard,
  type ChartCard,
  type ChartCardType,
} from '@shared/chart-card';

interface DataRow {
  label: string;
  value: string;
}

interface ChartInsertDialogProps {
  /** 插入点：对话框只负责产出围栏块文本，写进正文由调用方决定 */
  onInsert: (fence: string) => void;
  onCancel: () => void;
}

const TYPE_OPTIONS: Array<{
  value: ChartCardType;
  label: string;
  Icon: typeof BarChart3;
}> = [
  { value: 'bar', label: '柱状图', Icon: BarChart3 },
  { value: 'line', label: '折线图', Icon: LineChart },
  { value: 'area', label: '面积图', Icon: TrendingUp },
  { value: 'pie', label: '饼图', Icon: PieChart },
];

const DEFAULT_ROWS: DataRow[] = [
  { label: '一月', value: '120' },
  { label: '二月', value: '200' },
  { label: '三月', value: '150' },
  { label: '四月', value: '260' },
];

export default function ChartInsertDialog({ onInsert, onCancel }: ChartInsertDialogProps) {
  const [type, setType] = useState<ChartCardType>('bar');
  const [title, setTitle] = useState('');
  const [height, setHeight] = useState<number>(CHART_DEFAULT_HEIGHT);
  const [rows, setRows] = useState<DataRow[]>(DEFAULT_ROWS);

  const isPie = type === 'pie';

  const card = useMemo<ChartCard | null>(() => {
    const cleaned = rows
      .map((row) => ({ label: row.label.trim(), value: Number(row.value) }))
      .filter((row) => row.label.length > 0 && Number.isFinite(row.value));

    if (cleaned.length === 0) return null;

    const base = { type, title: title.trim() || undefined, height };

    if (isPie) {
      return {
        ...base,
        data: cleaned.map((row) => ({ name: row.label, value: row.value })),
      };
    }

    return {
      ...base,
      xAxis: cleaned.map((row) => row.label),
      series: [
        {
          name: title.trim() || '数值',
          data: cleaned.map((row) => row.value),
        },
      ],
    };
  }, [type, title, height, rows, isPie]);

  const updateRow = (index: number, patch: Partial<DataRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { label: '', value: '' }]);
  };

  const handleInsert = () => {
    if (!card) return;
    onInsert(encodeChartCard(card));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="插入图表"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-800 bg-[#0a0a0a]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-100">插入图表</h2>
          <button
            onClick={onCancel}
            className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 图表类型 */}
          <div className="mb-4 grid grid-cols-4 gap-2">
            {TYPE_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setType(value)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs transition-colors ${
                  type === value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>

          {/* 标题 */}
          <label className="mb-1 block text-sm text-gray-500">图表标题（可选）</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={isPie ? '例如：各渠道占比' : '例如：近四个月阅读量'}
            className="mb-4 w-full rounded-lg border border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 outline-none transition-colors focus:border-blue-500"
          />

          {/* 数据编辑 */}
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {isPie ? '扇区名称与数值' : '类目与数值'}
            </p>
            <button
              onClick={addRow}
              className="flex items-center gap-1 text-sm text-blue-500 transition-colors hover:text-blue-400"
            >
              <Plus className="h-4 w-4" />
              添加一行
            </button>
          </div>

          <div className="mb-4 space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.label}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                  placeholder={isPie ? '名称' : '类目'}
                  className="flex-1 rounded-lg border border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 outline-none transition-colors focus:border-blue-500"
                />
                <input
                  type="number"
                  value={row.value}
                  onChange={(event) => updateRow(index, { value: event.target.value })}
                  placeholder="数值"
                  className="w-32 rounded-lg border border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 outline-none transition-colors focus:border-blue-500"
                />
                <button
                  onClick={() => removeRow(index)}
                  disabled={rows.length <= 1}
                  className="rounded-full p-2 text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="删除这一行"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* 高度 */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between text-sm text-gray-500">
              <span>图表高度</span>
              <span className="text-gray-600">{height}px</span>
            </div>
            <input
              type="range"
              min={CHART_MIN_HEIGHT}
              max={CHART_MAX_HEIGHT}
              step={20}
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
              className="w-full accent-blue-500"
            />
          </div>

          {/* 实时预览 */}
          <p className="mb-1 text-sm text-gray-500">预览</p>
          {card ? (
            <ChartBlock card={card} />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-800 text-sm text-gray-600">
              至少填一行有效数据
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-800 px-5 py-4">
          <button
            onClick={onCancel}
            className="rounded-full border border-gray-700 px-5 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800"
          >
            取消
          </button>
          <button
            onClick={handleInsert}
            disabled={!card}
            className="rounded-full bg-blue-500 px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-500/50"
          >
            插入到正文
          </button>
        </div>
      </div>
    </div>
  );
}
