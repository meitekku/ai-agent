"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Points,
  ShaderMaterial,
  AdditiveBlending,
  Color,
} from "three";
import type { SimNode, SimLink } from "@/lib/force-simulation";

interface GraphEdgesProps {
  nodes: SimNode[];
  links: SimLink[];
  isDark: boolean;
}

export function GraphEdges({ nodes, links, isDark }: GraphEdgesProps) {
  const linesRef = useRef<LineSegments>(null);
  const particlesRef = useRef<Points>(null);
  const timeRef = useRef(0);
  const colorSetRef = useRef(false);

  const nodeMap = useMemo(() => {
    const map = new Map<string, SimNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  useFrame((_, delta) => {
    timeRef.current += delta;
    const lines = linesRef.current;
    const particles = particlesRef.current;
    if (!lines || !particles) return;

    const linePos = lines.geometry.getAttribute(
      "position",
    ) as Float32BufferAttribute;
    const particlePos = particles.geometry.getAttribute(
      "position",
    ) as Float32BufferAttribute;

    const t = timeRef.current;

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const sid =
        typeof link.source === "object" ? link.source.id : link.source;
      const tid =
        typeof link.target === "object" ? link.target.id : link.target;
      const src = nodeMap.get(sid);
      const tgt = nodeMap.get(tid);
      if (!src || !tgt) continue;

      const sx = src.x || 0,
        sy = src.y || 0,
        sz = src.z || 0;
      const tx = tgt.x || 0,
        ty = tgt.y || 0,
        tz = tgt.z || 0;

      linePos.setXYZ(i * 2, sx, sy, sz);
      linePos.setXYZ(i * 2 + 1, tx, ty, tz);

      // Flowing particle (slower)
      const phase = (t * 0.1 + i * 0.07) % 1;
      particlePos.setXYZ(
        i,
        sx + (tx - sx) * phase,
        sy + (ty - sy) * phase,
        sz + (tz - sz) * phase,
      );
    }

    linePos.needsUpdate = true;
    particlePos.needsUpdate = true;

    // Set edge colors once (static — no hover highlight)
    if (!colorSetRef.current && links.length > 0) {
      const lineColor = lines.geometry.getAttribute(
        "color",
      ) as Float32BufferAttribute;
      const [r, g, b] = isDark ? [0.35, 0.4, 0.5] : [0.55, 0.58, 0.65];
      for (let i = 0; i < links.length; i++) {
        lineColor.setXYZ(i * 2, r, g, b);
        lineColor.setXYZ(i * 2 + 1, r, g, b);
      }
      lineColor.needsUpdate = true;
      colorSetRef.current = true;
    }
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
      opacity: isDark ? 0.35 : 0.5,
      depthWrite: false,
    });
  }, [isDark]);

  // Particle geometry
  const particleGeo = useMemo(() => {
    const geo = new BufferGeometry();
    const pos = new Float32Array(links.length * 3);
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    return geo;
  }, [links.length]);

  // Circle particle shader — primary color, round shape
  const particleMat = useMemo(() => {
    return new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: isDark ? AdditiveBlending : undefined,
      uniforms: {
        uColor: { value: new Color(isDark ? "#34d399" : "#10b981") },
        uOpacity: { value: isDark ? 0.8 : 0.9 },
      },
      vertexShader: /* glsl */ `
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 4.0 * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.3, d) * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });
  }, [isDark]);

  if (links.length === 0) return null;

  return (
    <>
      <lineSegments ref={linesRef} geometry={lineGeo} material={lineMat} />
      <points
        ref={particlesRef}
        geometry={particleGeo}
        material={particleMat}
      />
    </>
  );
}
