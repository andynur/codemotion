import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { FlowEdgeKind, FlowGraph, FlowNode } from "../tracer/types";
import { useT } from "../app/i18n";
import type { FlowPath } from "./flowModel";
import { travelMs } from "./motion";
import "./flow.css";

const kinds: FlowEdgeKind[] = ["flow", "true", "false", "loop"];

function Shape({ node }: { node: FlowNode }) {
  const { x, y, w, h } = node;
  const left = x - w / 2;
  if (node.kind === "decision") return <polygon className="flowShape" points={`${x},${y} ${x + w / 2},${y + h / 2} ${x},${y + h} ${left},${y + h / 2}`} />;
  if (node.kind === "io") {
    const slant = h / 4;
    return <polygon className="flowShape" points={`${left + slant},${y} ${left + w},${y} ${left + w - slant},${y + h} ${left},${y + h}`} />;
  }
  return <rect className="flowShape" x={left} y={y} width={w} height={h} rx={node.kind === "terminal" ? h / 2 : undefined} />;
}

interface FlowChartProps {
  flow: FlowGraph;
  path: FlowPath;
  index: number;
}

export function FlowChart({ flow, path, index }: FlowChartProps) {
  const { t } = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const activeId = path.nodes[index];
  const edgeId = path.edges[index];
  const edge = flow.edges.find((item) => item.id === edgeId);

  const { visitedNodes, visitedEdges } = useMemo(() => ({
    visitedNodes: new Set(path.nodes.slice(0, index)),
    visitedEdges: new Set(path.edges.slice(0, index + 1)),
  }), [path, index]);

  // Move the dot along the edge just travelled, then keep the active node in view.
  useEffect(() => {
    const line = trail.current;
    const marker = dot.current;
    if (!line || !marker) return;
    const duration = travelMs();
    const length = line.getTotalLength();
    if (!duration || !length) { marker.style.opacity = "0"; return; }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const point = line.getPointAtLength(length * eased);
      marker.setAttribute("cx", String(point.x));
      marker.setAttribute("cy", String(point.y));
      marker.style.opacity = progress < 1 ? "1" : "0";
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [edgeId, index]);

  useEffect(() => {
    const box = scroller.current;
    const node = flow.nodes.find((item) => item.id === activeId);
    const canvas = svg.current;
    if (!box || !node || !canvas) return;
    const scale = canvas.clientWidth / flow.width;
    const top = (node.y + node.h / 2) * scale - box.clientHeight / 2;
    const left = node.x * scale - box.clientWidth / 2;
    box.scrollTo({ top, left, behavior: travelMs() ? "smooth" : "auto" });
  }, [activeId, flow]);

  return (
    <div className="flowScroller" ref={scroller}>
      <svg ref={svg} className="flowChart" viewBox={`0 0 ${flow.width} ${flow.height}`} style={{ "--flow-width": `${flow.width}px` } as CSSProperties} role="img" aria-label={t.flowLabel}>
        <defs>
          {kinds.map((kind) => (
            <marker key={kind} id={`arrow-${kind}`} className={`flowArrow edge-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" />
            </marker>
          ))}
        </defs>

        <g className="flowEdges">
          {flow.edges.map((item) => (
            <path key={item.id} d={item.d} className={`flowEdge edge-${item.kind}${visitedEdges.has(item.id) ? " visited" : ""}`} markerEnd={`url(#arrow-${item.kind})`} />
          ))}
          {edge && <path key={`trail-${index}`} ref={trail} d={edge.d} pathLength={1} className={`flowTrail edge-${edge.kind}`} />}
        </g>

        <g className="flowLabels">
          {flow.edges.filter((item) => item.label && item.labelAt).map((item) => (
            <text key={item.id} x={item.labelAt![0]} y={item.labelAt![1]} textAnchor={item.labelAnchor} className={`flowEdgeLabel edge-${item.kind}${item.id === edgeId ? " current" : ""}`}>{item.label}</text>
          ))}
        </g>

        <g className="flowNodes">
          {flow.nodes.map((node) => {
            const active = node.id === activeId;
            const state = active ? " active" : visitedNodes.has(node.id) ? " visited" : "";
            return (
              <g key={active ? `${node.id}-${index}` : node.id} className={`flowNode node-${node.kind}${state}${active && edge ? " arriving" : ""}`} data-node={node.id}>
                <Shape node={node} />
                <text x={node.x} y={node.y + node.h / 2} className="flowText">{node.label}</text>
              </g>
            );
          })}
        </g>

        {edge && <circle ref={dot} className={`flowDot edge-${edge.kind}`} r="5" cx="-10" cy="-10" />}
      </svg>
    </div>
  );
}
