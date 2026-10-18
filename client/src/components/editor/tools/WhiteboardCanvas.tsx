import { FC, useRef, useState, useEffect, useCallback } from 'react';
import {
  Pencil,
  Square,
  Circle,
  MoveRight,
  Type,
  Eraser,
  RotateCcw,
  Trash2,
  Download,
  PlusCircle,
  X,
  Palette,
} from 'lucide-react';

interface WhiteboardCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertImage: (dataUrl: string) => void;
}

type ToolType = 'pencil' | 'rect' | 'circle' | 'arrow' | 'text' | 'eraser';

const GOOGLE_PALETTE = [
  '#1a73e8', // Google Blue
  '#ea4335', // Google Red
  '#fbbc04', // Google Yellow
  '#34a853', // Google Green
  '#202124', // Google Dark Slate
  '#9aa0a6', // Google Light Gray
];

export const WhiteboardCanvas: FC<WhiteboardCanvasProps> = ({
  isOpen,
  onClose,
  onInsertImage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<ToolType>('pencil');
  const [color, setColor] = useState<string>('#1a73e8');
  const [lineWidth, setLineWidth] = useState<number>(3);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const snapshotRef = useRef<ImageData | null>(null);

  // 初始化画布
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 自适应尺寸
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 默认纯白背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // 绘制轻量网格
    drawGrid(ctx, rect.width, rect.height);

    // 存入初始历史记录
    const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory([initialData]);
  }, [isOpen]);

  const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(218, 220, 224, 0.45)';
    ctx.lineWidth = 1;
    const step = 24;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCanvasPos(e);
    startPosRef.current = pos;
    setIsDrawing(true);

    // 保存当前画布状态作为图形预览底图
    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (tool === 'pencil' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.lineWidth = tool === 'eraser' ? lineWidth * 3 : lineWidth;
    } else if (tool === 'text') {
      const text = prompt('请输入要标注的文字：');
      if (text) {
        ctx.font = 'bold 16px "Google Sans", sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(text, pos.x, pos.y);
        saveHistory();
      }
      setIsDrawing(false);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentPos = getCanvasPos(e);
    const startPos = startPosRef.current;

    if (tool === 'pencil' || tool === 'eraser') {
      ctx.lineTo(currentPos.x, currentPos.y);
      ctx.stroke();
    } else if (snapshotRef.current) {
      // 矩形/圆/箭头：每次恢复快照再重绘预览
      ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;

      if (tool === 'rect') {
        ctx.strokeRect(
          startPos.x,
          startPos.y,
          currentPos.x - startPos.x,
          currentPos.y - startPos.y,
        );
      } else if (tool === 'circle') {
        ctx.beginPath();
        const rx = Math.abs(currentPos.x - startPos.x) / 2;
        const ry = Math.abs(currentPos.y - startPos.y) / 2;
        const cx = Math.min(startPos.x, currentPos.x) + rx;
        const cy = Math.min(startPos.y, currentPos.y) + ry;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (tool === 'arrow') {
        drawArrow(ctx, startPos.x, startPos.y, currentPos.x, currentPos.y);
      }
    }
  };

  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ) => {
    const headlen = 12;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headlen * Math.cos(angle - Math.PI / 6),
      toY - headlen * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      toX - headlen * Math.cos(angle + Math.PI / 6),
      toY - headlen * Math.sin(angle + Math.PI / 6),
    );
    ctx.lineTo(toX, toY);
    ctx.fillStyle = color;
    ctx.fill();
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveHistory();
  };

  const saveHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-15), state]);
  };

  const undo = () => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = history.slice(0, -1);
    const prevState = newHistory[newHistory.length - 1];
    ctx.putImageData(prevState, 0, 0);
    setHistory(newHistory);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    drawGrid(ctx, rect.width, rect.height);
    saveHistory();
  };

  const handleInsert = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onInsertImage(dataUrl);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#1f2023] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 顶部工具栏 (专业版 风格) */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 dark:border-gray-800/80 bg-[#f8fafd] dark:bg-[#18191b]">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <Pencil className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                白板草图工坊 (Canvas Studio)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                本地矢量草绘，一键嵌入文章正文
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleInsert}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-medium rounded-full shadow-md transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              插入到当前文章
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 调色与绘图控制区 */}
        <div className="flex flex-wrap items-center justify-between px-6 py-2.5 bg-gray-50 dark:bg-[#232427] border-b border-gray-200 dark:border-gray-800 text-xs">
          {/* 工具切换 */}
          <div className="flex items-center gap-1 bg-white dark:bg-[#1a1b1e] p-1 rounded-2xl border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setTool('pencil')}
              className={`p-1.5 rounded-xl transition-all ${
                tool === 'pencil'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="自由手绘"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('rect')}
              className={`p-1.5 rounded-xl transition-all ${
                tool === 'rect'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="矩形框"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('circle')}
              className={`p-1.5 rounded-xl transition-all ${
                tool === 'circle'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="圆形/椭圆"
            >
              <Circle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('arrow')}
              className={`p-1.5 rounded-xl transition-all ${
                tool === 'arrow'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="箭头连线"
            >
              <MoveRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('text')}
              className={`p-1.5 rounded-xl transition-all ${
                tool === 'text'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="添加文本"
            >
              <Type className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`p-1.5 rounded-xl transition-all ${
                tool === 'eraser'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="橡皮擦"
            >
              <Eraser className="w-4 h-4" />
            </button>
          </div>

          {/* 配色方案 */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-medium">颜色:</span>
            <div className="flex items-center gap-1.5">
              {GOOGLE_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    color === c ? 'scale-125 border-blue-400 shadow' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* 笔刷粗细与操作 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-gray-400 font-medium">线条:</span>
              <button
                onClick={() => setLineWidth(2)}
                className={`px-2 py-0.5 rounded-lg border text-xs ${
                  lineWidth === 2
                    ? 'bg-blue-50 border-blue-400 text-blue-600 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                细
              </button>
              <button
                onClick={() => setLineWidth(4)}
                className={`px-2 py-0.5 rounded-lg border text-xs ${
                  lineWidth === 4
                    ? 'bg-blue-50 border-blue-400 text-blue-600 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                中
              </button>
              <button
                onClick={() => setLineWidth(8)}
                className={`px-2 py-0.5 rounded-lg border text-xs ${
                  lineWidth === 8
                    ? 'bg-blue-50 border-blue-400 text-blue-600 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                粗
              </button>
            </div>

            <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-2">
              <button
                onClick={undo}
                className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="撤销"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={clearCanvas}
                className="p-1.5 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                title="清空"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 画布区域 */}
        <div className="relative w-full h-[480px] bg-white cursor-crosshair overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-full block touch-none"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
          />
        </div>
      </div>
    </div>
  );
};
