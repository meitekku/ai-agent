"use client";

import { useRef, useMemo, useCallback } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import {
  InstancedMesh,
  Color,
  Object3D,
  ShaderMaterial,
} from "three";
import type { SimNode } from "@/lib/force-simulation";

// ---------------------------------------------------------------------------
// Community colors
// ---------------------------------------------------------------------------

const PALETTE = [
  "#818cf8", // indigo (brighter)
  "#fb7185", // rose
  "#34d399", // emerald
  "#fbbf24", // amber
  "#60a5fa", // blue
  "#f472b6", // pink
  "#2dd4bf", // teal
  "#a78bfa", // violet
  "#f87171", // red
  "#22d3ee", // cyan
  "#a3e635", // lime
  "#fb923c", // orange
];

function communityColor(community: number, communityCount: number): string {
  if (communityCount <= PALETTE.length) return PALETTE[community % PALETTE.length];
  const hue = (community / communityCount) * 360;
  return `hsl(${hue}, 80%, 65%)`;
}

// ---------------------------------------------------------------------------
// Glow shader — reads instanceColor from InstancedMesh.setColorAt()
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
  attribute vec3 instanceColor;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vColor = instanceColor;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.0);
    // Core bright + edge glow — values > 1.0 trigger Bloom
    vec3 glow = vColor * (1.2 + fresnel * 1.8);
    gl_FragColor = vec4(glow, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GraphNodesProps {
  nodes: SimNode[];
  communityCount: number;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

const dummy = new Object3D();
const tempColor = new Color();

export function GraphNodes({
  nodes,
  communityCount,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: GraphNodesProps) {
  const meshRef = useRef<InstancedMesh>(null);

  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    return map;
  }, [nodes]);

  const colors = useMemo(() => {
    return nodes.map((n) => new Color(communityColor(n.community, communityCount)));
  }, [nodes, communityCount]);

  // Bigger nodes: base 1.0, scale up with degree
  const sizes = useMemo(() => {
    return nodes.map((n) => Math.log2(n.degree + 1) * 1.2 + 1.0);
  }, [nodes]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const s = sizes[i];
      const isHovered = n.id === hoveredId;
      const isSelected = n.id === selectedId;
      const scale = isHovered || isSelected ? s * 1.5 : s;

      dummy.position.set(n.x || 0, n.y || 0, n.z || 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const c = colors[i];
      if (isHovered || isSelected) {
        tempColor.set(c).multiplyScalar(2.0);
      } else {
        tempColor.set(c);
      }
      mesh.setColorAt(i, tempColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined && e.instanceId < nodes.length) {
        onHover(nodes[e.instanceId].id);
        document.body.style.cursor = "pointer";
      }
    },
    [nodes, onHover],
  );

  const handlePointerOut = useCallback(() => {
    onHover(null);
    document.body.style.cursor = "auto";
  }, [onHover]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined && e.instanceId < nodes.length) {
        onSelect(nodes[e.instanceId].id);
      }
    },
    [nodes, onSelect],
  );

  // Labels for top nodes by degree
  const labelNodes = useMemo(() => {
    const count = Math.max(5, Math.floor(nodes.length * 0.06));
    const sorted = [...nodes].sort((a, b) => b.degree - a.degree);
    return sorted.slice(0, Math.min(count, 60));
  }, [nodes]);

  if (nodes.length === 0) return null;

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, nodes.length]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 16, 12]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          toneMapped={false}
        />
      </instancedMesh>

      {/* Labels for high-degree nodes */}
      {labelNodes.map((n) => {
        const idx = idToIndex.get(n.id) ?? 0;
        return (
          <Billboard
            key={n.id}
            position={[
              n.x || 0,
              (n.y || 0) + sizes[idx] + 2,
              n.z || 0,
            ]}
            follow
            lockX={false}
            lockY={false}
            lockZ={false}
          >
            <Text
              fontSize={3.2}
              color={
                hoveredId === n.id || selectedId === n.id
                  ? "#ffffff"
                  : "#cbd5e1"
              }
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.2}
              outlineColor="#000000"
            >
              {n.id.length > 20 ? n.id.slice(0, 20) + "…" : n.id}
            </Text>
          </Billboard>
        );
      })}

      {/* Hovered label if not already visible */}
      {hoveredId &&
        !labelNodes.find((n) => n.id === hoveredId) &&
        (() => {
          const idx = idToIndex.get(hoveredId);
          if (idx === undefined) return null;
          const n = nodes[idx];
          return (
            <Billboard
              position={[n.x || 0, (n.y || 0) + sizes[idx] + 2, n.z || 0]}
              follow
              lockX={false}
              lockY={false}
              lockZ={false}
            >
              <Text
                fontSize={3.2}
                color="#ffffff"
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.2}
                outlineColor="#000000"
              >
                {n.id.length > 20 ? n.id.slice(0, 20) + "…" : n.id}
              </Text>
            </Billboard>
          );
        })()}
    </>
  );
}
