"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  AdditiveBlending,
  Color,
} from "three";
import type { SimNode, SimLink } from "@/lib/force-simulation";

interface GraphEdgesProps {
  nodes: SimNode[];
  links: SimLink[];
  hoveredId: string | null;
  isDark: boolean;
}

export function GraphEdges({ nodes, links, hoveredId, isDark }: GraphEdgesProps) {
  const linesRef = useRef<LineSegments>(null);
  const particlesRef = useRef<Points>(null);
  const timeRef = useRef(0);

  const nodeMap = useMemo(() => {
    const map = new Map<string, SimNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  const hoveredEdgeSet = useMemo(() => {
    if (!hoveredId) return null;
    const set = new Set<number>();
    links.forEach((link, i) => {
      const sid = typeof link.source === "object" ? link.source.id : link.source;
      const tid = typeof link.target === "object" ? link.target.id : link.target;
      if (sid === hoveredId || tid === hoveredId) set.add(i);
    });
    return set;
  }, [hoveredId, links]);

  useFrame((_, delta) => {
    timeRef.current += delta;
    const lines = linesRef.current;
    const particles = particlesRef.current;
    if (!lines || !particles) return;

    const linePos = lines.geometry.getAttribute("position") as Float32BufferAttribute;
    const lineColor = lines.geometry.getAttribute("color") as Float32BufferAttribute;
    const particlePos = particles.geometry.getAttribute("position") as Float32BufferAttribute;

    const t = timeRef.current;

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const sid = typeof link.source === "object" ? link.source.id : link.source;
      const tid = typeof link.target === "object" ? link.target.id : link.target;
      const src = nodeMap.get(sid);
      const tgt = nodeMap.get(tid);
      if (!src || !tgt) continue;

      const sx = src.x || 0, sy = src.y || 0, sz = src.z || 0;
      const tx = tgt.x || 0, ty = tgt.y || 0, tz = tgt.z || 0;

      linePos.setXYZ(i * 2, sx, sy, sz);
      linePos.setXYZ(i * 2 + 1, tx, ty, tz);

      const isHighlighted = hoveredEdgeSet?.has(i);
      if (isHighlighted) {
        lineColor.setXYZ(i * 2, 0.4, 0.6, 1.0);
        lineColor.setXYZ(i * 2 + 1, 0.4, 0.6, 1.0);
      } else if (isDark) {
        lineColor.setXYZ(i * 2, 0.35, 0.4, 0.5);
        lineColor.setXYZ(i * 2 + 1, 0.35, 0.4, 0.5);
      } else {
        lineColor.setXYZ(i * 2, 0.55, 0.58, 0.65);
        lineColor.setXYZ(i * 2 + 1, 0.55, 0.58, 0.65);
      }

      // Flowing particle
      const phase = (t * 0.25 + i * 0.07) % 1;
      particlePos.setXYZ(
        i,
        sx + (tx - sx) * phase,
        sy + (ty - sy) * phase,
        sz + (tz - sz) * phase,
      );
    }

    linePos.needsUpdate = true;
    lineColor.needsUpdate = true;
    particlePos.needsUpdate = true;
  });

  // Line geometry
  const lineGeo = useMemo(() => {
    const geo = new BufferGeometry();
    const pos = new Float32Array(links.length * 6);
    const col = new Float32Array(links.length * 6);
    col.fill(0.4);
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
    return geo;
  }, [links.length]);

  const lineMat = useMemo(() => {
    return new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
  }, []);

  useFrame(() => {
    if (lineMat) {
      lineMat.opacity = hoveredId ? 0.12 : isDark ? 0.35 : 0.5;
    }
  });

  // Particle geometry
  const particleGeo = useMemo(() => {
    const geo = new BufferGeometry();
    const pos = new Float32Array(links.length * 3);
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    return geo;
  }, [links.length]);

  const particleMat = useMemo(() => {
    return new PointsMaterial({
      color: new Color(isDark ? "#93c5fd" : "#3b82f6"),
      size: 0.6,
      transparent: true,
      opacity: isDark ? 0.7 : 0.9,
      blending: isDark ? AdditiveBlending : undefined,
      depthWrite: false,
      sizeAttenuation: true,
    });
  }, [isDark]);

  if (links.length === 0) return null;

  return (
    <>
      <lineSegments ref={linesRef} geometry={lineGeo} material={lineMat} />
      <points ref={particlesRef} geometry={particleGeo} material={particleMat} />
    </>
  );
}
