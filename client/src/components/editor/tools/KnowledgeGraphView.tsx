import { FC, useState, useEffect, useRef, useMemo } from 'react';
import { Network, X, ZoomIn, ZoomOut, RefreshCw, Hash, FileText, Link2 } from 'lucide-react';

interface KnowledgeGraphViewProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  title: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: 'doc' | 'heading' | 'tag' | 'link';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

export const KnowledgeGraphView: FC<KnowledgeGraphViewProps> = ({
  isOpen,
  onClose,
  content,
  title,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // 解析 Markdown 内容提取节点和关系边
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!isOpen) return { initialNodes: [], initialEdges: [] };

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // 中心根节点：当前文档
    const rootId = 'root';
    nodes.push({
      id: rootId,
      label: title || '当前文章',
      type: 'doc',
      x: 350,
      y: 220,
      vx: 0,
      vy: 0,
      radius: 18,
      color: '#1a73e8', // Google Blue
    });

    const lines = content.split('\n');
    const tagsSet = new Set<string>();
    const wikiLinksSet = new Set<string>();
    const headings: string[] = [];

    lines.forEach((line) => {
      // 提取标题 (# 标题)
      const hMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (hMatch && hMatch[2]) {
        headings.push(hMatch[2].trim());
      }

      // 提取 #tag 标签
      const tagMatches = line.matchAll(/#([\p{L}\p{N}_-]+)/gu);
      for (const m of tagMatches) {
        if (m[1]) tagsSet.add(m[1]);
      }

      // 提取 [[WikiLink]] 双向链
      const wikiMatches = line.matchAll(/\[\[(.*?)\]\]/g);
      for (const m of wikiMatches) {
        if (m[1]) wikiLinksSet.add(m[1].trim());
      }
    });

    // 挂载标题节点
    headings.slice(0, 10).forEach((h, idx) => {
      const hId = `heading-${idx}`;
      nodes.push({
        id: hId,
        label: h,
        type: 'heading',
        x: 350 + (Math.random() - 0.5) * 200,
        y: 220 + (Math.random() - 0.5) * 200,
        vx: 0,
        vy: 0,
        radius: 12,
        color: '#34a853', // Google Green
      });
      edges.push({ source: rootId, target: hId });
    });

    // 挂载标签节点
    Array.from(tagsSet).slice(0, 10).forEach((tag, idx) => {
      const tId = `tag-${idx}`;
      nodes.push({
        id: tId,
        label: `#${tag}`,
        type: 'tag',
        x: 350 + (Math.random() - 0.5) * 300,
        y: 220 + (Math.random() - 0.5) * 300,
        vx: 0,
        vy: 0,
        radius: 10,
        color: '#ea4335', // Google Red
      });
      edges.push({ source: rootId, target: tId });
    });

    // 挂载双链节点
    Array.from(wikiLinksSet).slice(0, 10).forEach((link, idx) => {
      const lId = `link-${idx}`;
      nodes.push({
        id: lId,
        label: `[[${link}]]`,
        type: 'link',
        x: 350 + (Math.random() - 0.5) * 320,
        y: 220 + (Math.random() - 0.5) * 320,
        vx: 0,
        vy: 0,
        radius: 11,
        color: '#fbbc04', // Google Yellow
      });
      edges.push({ source: rootId, target: lId });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [isOpen, content, title]);

  const [nodes, setNodes] = useState<GraphNode[]>(initialNodes);
  const [edges, setEdges] = useState<GraphEdge[]>(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  // 物理力导向模拟循环 (Force Simulation)
  useEffect(() => {
    if (!isOpen || nodes.length === 0) return;

    let localNodes = [...nodes];
    const width = 700;
    const height = 450;
    let iteration = 0;

    const tick = () => {
      iteration++;
      const alpha = Math.max(0.01, 1 - iteration / 180);

      // 斥力 (Coulomb)
      for (let i = 0; i < localNodes.length; i++) {
        for (let j = i + 1; j < localNodes.length; j++) {
          const dx = localNodes[j].x - localNodes[i].x;
          const dy = localNodes[j].y - localNodes[i].y;
          const distSq = dx * dx + dy * dy + 100;
          const dist = Math.sqrt(distSq);
          const force = (800 / distSq) * alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (localNodes[i].id !== draggedNode) {
            localNodes[i].x -= fx;
            localNodes[i].y -= fy;
          }
          if (localNodes[j].id !== draggedNode) {
            localNodes[j].x += fx;
            localNodes[j].y += fy;
          }
        }
      }

      // 引力 (Spring)
      edges.forEach((edge) => {
        const source = localNodes.find((n) => n.id === edge.source);
        const target = localNodes.find((n) => n.id === edge.target);
        if (!source || !target) return;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const springForce = (dist - 100) * 0.05 * alpha;
        const fx = (dx / (dist || 1)) * springForce;
        const fy = (dy / (dist || 1)) * springForce;

        if (source.id !== draggedNode && source.id !== 'root') {
          source.x += fx;
          source.y += fy;
        }
        if (target.id !== draggedNode) {
          target.x -= fx;
          target.y -= fy;
        }
      });

      // 向中心吸引力
      localNodes.forEach((n) => {
        if (n.id === draggedNode) return;
        n.x += (width / 2 - n.x) * 0.02 * alpha;
        n.y += (height / 2 - n.y) * 0.02 * alpha;
      });

      setNodes([...localNodes]);

      if (iteration < 180 || draggedNode) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, edges, draggedNode]);

  const handleMouseDown = (nodeId: string) => {
    setDraggedNode(nodeId);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggedNode || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    setNodes((prev) =>
      prev.map((n) => (n.id === draggedNode ? { ...n, x, y } : n)),
    );
  };

  const handleMouseUp = () => {
    setDraggedNode(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl h-[75vh] bg-white dark:bg-[#1a1b1e] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-[#f8fafd] dark:bg-[#151618]">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
              <Network className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                知识图谱网络 (Knowledge Graph View)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                纯本地提取文档、章节、标签与双链关联，力导向物理仿真
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 缩放按钮 */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-0.5">
              <button
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
                className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-black rounded-full"
                title="缩小"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs px-2 text-gray-500 font-mono">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
                className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-black rounded-full"
                title="放大"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 节点类型说明 Chip 栏 */}
        <div className="flex items-center gap-3 px-6 py-2 bg-gray-50 dark:bg-[#202124] border-b border-gray-200 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-300">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1a73e8]" /> 根文档
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#34a853]" /> 章节标题
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ea4335]" /> #标签
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#fbbc04]" /> [[双链]]
          </span>
          <span className="text-gray-400 ml-auto">共 {nodes.length} 个节点</span>
        </div>

        {/* SVG 力导向图画布 */}
        <div className="relative flex-1 bg-[#fafafa] dark:bg-[#121316] overflow-hidden select-none">
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <g transform={`scale(${zoom})`}>
              {/* 连线 */}
              {edges.map((edge, idx) => {
                const source = nodes.find((n) => n.id === edge.source);
                const target = nodes.find((n) => n.id === edge.target);
                if (!source || !target) return null;
                return (
                  <line
                    key={idx}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="rgba(154, 160, 166, 0.4)"
                    strokeWidth="1.5"
                    strokeDasharray={target.type === 'tag' ? '3 3' : undefined}
                  />
                );
              })}

              {/* 节点 */}
              {nodes.map((node) => (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseDown={() => handleMouseDown(node.id)}
                  className="cursor-pointer group"
                >
                  <circle
                    r={node.radius}
                    fill={node.color}
                    className="transition-all duration-150 drop-shadow-sm group-hover:r-[16px]"
                  />
                  <text
                    y={node.radius + 12}
                    textAnchor="middle"
                    className="text-[10px] font-sans fill-gray-700 dark:fill-gray-300 select-none pointer-events-none font-medium"
                  >
                    {node.label.length > 12
                      ? node.label.slice(0, 10) + '...'
                      : node.label}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};
