import React, { useState, useEffect } from 'react';
import {
  Table as TableIcon,
  X,
  Plus,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  Columns,
  Rows,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  splitTableRow,
  parseMarkdownTable,
  serializeMarkdownTable,
  type TableAlignment,
  type ParsedTableData,
} from '@shared/text/markdown-table';

// 保持组件原有的对外 API，调用方无需改动
export { splitTableRow, parseMarkdownTable, serializeMarkdownTable };
export type { TableAlignment, ParsedTableData };

interface TableGridEditorProps {
  isOpen: boolean;
  onClose: () => void;
  rawTableMarkdown?: string;
  onApplyTable: (markdown: string) => void;
}

export const TableGridEditor: React.FC<TableGridEditorProps> = ({
  isOpen,
  onClose,
  rawTableMarkdown = '',
  onApplyTable,
}) => {
  const [tableData, setTableData] = useState<ParsedTableData>(() =>
    parseMarkdownTable(rawTableMarkdown),
  );

  useEffect(() => {
    if (isOpen) {
      setTableData(parseMarkdownTable(rawTableMarkdown));
    }
  }, [isOpen, rawTableMarkdown]);

  if (!isOpen) return null;

  // 更新表头文本
  const handleHeaderChange = (colIdx: number, val: string) => {
    const nextHeaders = [...tableData.headers];
    nextHeaders[colIdx] = val;
    setTableData({ ...tableData, headers: nextHeaders });
  };

  // 更新单元格文本
  const handleCellChange = (rowIdx: number, colIdx: number, val: string) => {
    const nextRows = tableData.rows.map((r) => [...r]);
    if (!nextRows[rowIdx]) return;
    nextRows[rowIdx][colIdx] = val;
    setTableData({ ...tableData, rows: nextRows });
  };

  // 循环切换对齐方式 (left -> center -> right -> left)
  const handleCycleAlignment = (colIdx: number) => {
    const nextAlign = [...tableData.alignments];
    const current = nextAlign[colIdx] || 'left';
    const mapping: Record<TableAlignment, TableAlignment> = {
      left: 'center',
      center: 'right',
      right: 'left',
    };
    nextAlign[colIdx] = mapping[current];
    setTableData({ ...tableData, alignments: nextAlign });
  };

  // 新增行
  const handleAddRow = () => {
    const emptyRow = new Array(tableData.headers.length).fill('');
    setTableData({ ...tableData, rows: [...tableData.rows, emptyRow] });
  };

  // 删除行
  const handleDeleteRow = (rowIdx: number) => {
    if (tableData.rows.length <= 1) {
      toast.warning('表格至少需要保留 1 行数据');
      return;
    }
    const nextRows = tableData.rows.filter((_, idx) => idx !== rowIdx);
    setTableData({ ...tableData, rows: nextRows });
  };

  // 新增列
  const handleAddColumn = () => {
    const colCount = tableData.headers.length;
    const nextHeaders = [...tableData.headers, `列 ${colCount + 1}`];
    const nextAlign = [...tableData.alignments, 'left' as TableAlignment];
    const nextRows = tableData.rows.map((r) => [...r, '']);
    setTableData({
      headers: nextHeaders,
      alignments: nextAlign,
      rows: nextRows,
    });
  };

  // 删除列
  const handleDeleteColumn = (colIdx: number) => {
    if (tableData.headers.length <= 1) {
      toast.warning('表格至少需要保留 1 列');
      return;
    }
    const nextHeaders = tableData.headers.filter((_, idx) => idx !== colIdx);
    const nextAlign = tableData.alignments.filter((_, idx) => idx !== colIdx);
    const nextRows = tableData.rows.map((r) => r.filter((_, idx) => idx !== colIdx));
    setTableData({
      headers: nextHeaders,
      alignments: nextAlign,
      rows: nextRows,
    });
  };

  // 提交写回编辑器
  const handleSave = () => {
    const markdown = serializeMarkdownTable(tableData);
    onApplyTable(markdown);
    toast.success('表格已成功插入并同步至正文');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div className="relative w-full max-w-4xl max-h-[85vh] rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1e1f22] p-6 shadow-2xl flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <TableIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                可视化表格工坊 (Table Grid Editor)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                零破坏输入法 · 自由增删行列 · 自动格式化对齐 Markdown 表格
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAddColumn}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
            >
              <Columns className="w-3.5 h-3.5 text-blue-500" />
              <span>添加列</span>
            </button>
            <button
              onClick={handleAddRow}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
            >
              <Rows className="w-3.5 h-3.5 text-emerald-500" />
              <span>添加行</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 表格网格编辑主体 */}
        <div className="flex-1 overflow-auto my-4 border border-gray-200 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-zinc-950/40 p-2">
          <table className="w-full border-collapse text-xs">
            {/* 表头 */}
            <thead>
              <tr className="bg-gray-100 dark:bg-zinc-900">
                <th className="p-2 border border-gray-200 dark:border-gray-800 w-12 text-center text-gray-400 font-mono">
                  #
                </th>
                {tableData.headers.map((header, colIdx) => (
                  <th
                    key={`h-${colIdx}`}
                    className="p-2 border border-gray-200 dark:border-gray-800 min-w-[140px]"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {/* 对齐方式切换按钮 */}
                      <button
                        onClick={() => handleCycleAlignment(colIdx)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        title={`当前对齐: ${tableData.alignments[colIdx] || 'left'} (点击切换)`}
                      >
                        {tableData.alignments[colIdx] === 'center' ? (
                          <AlignCenter className="w-3.5 h-3.5 text-blue-500" />
                        ) : tableData.alignments[colIdx] === 'right' ? (
                          <AlignRight className="w-3.5 h-3.5 text-amber-500" />
                        ) : (
                          <AlignLeft className="w-3.5 h-3.5 text-gray-500" />
                        )}
                      </button>

                      <input
                        type="text"
                        value={header}
                        onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                        className="w-full px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg border border-gray-300 dark:border-gray-700 font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:border-amber-500"
                        placeholder={`列标题 ${colIdx + 1}`}
                      />

                      {/* 删列按钮 */}
                      <button
                        onClick={() => handleDeleteColumn(colIdx)}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-gray-400 hover:text-red-500 transition-colors"
                        title="删除该列"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* 表体 */}
            <tbody>
              {tableData.rows.map((row, rowIdx) => (
                <tr
                  key={`r-${rowIdx}`}
                  className="hover:bg-white dark:hover:bg-zinc-900/60 transition-colors"
                >
                  <td className="p-2 border border-gray-200 dark:border-gray-800 text-center text-gray-400 font-mono text-[11px]">
                    <div className="flex items-center justify-center gap-1">
                      <span>{rowIdx + 1}</span>
                      <button
                        onClick={() => handleDeleteRow(rowIdx)}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                        title="删除该行"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  {tableData.headers.map((_, colIdx) => (
                    <td
                      key={`c-${rowIdx}-${colIdx}`}
                      className="p-1.5 border border-gray-200 dark:border-gray-800"
                    >
                      <input
                        type="text"
                        value={row[colIdx] || ''}
                        onChange={(e) =>
                          handleCellChange(rowIdx, colIdx, e.target.value)
                        }
                        className={`w-full px-2.5 py-1.5 bg-transparent rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-700 focus:bg-white dark:focus:bg-zinc-800 focus:border-blue-500 focus:outline-none text-gray-800 dark:text-gray-200 ${
                          tableData.alignments[colIdx] === 'center'
                            ? 'text-center'
                            : tableData.alignments[colIdx] === 'right'
                              ? 'text-right'
                              : 'text-left'
                        }`}
                        placeholder="输入内容..."
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-800 text-xs">
          <div className="text-gray-400 flex items-center gap-3">
            <span>
              当前规格: {tableData.headers.length} 列 × {tableData.rows.length} 行
            </span>
            <span>·</span>
            <span>点击列头对齐图标可轮换 左/中/右 排版</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-full border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-1.5 rounded-full bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-all shadow-sm active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>确认写回文章</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
