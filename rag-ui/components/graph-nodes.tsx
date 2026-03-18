"use client";

import { useRef, useMemo, useCallback } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { InstancedMesh, Color, Object3D, Group, Vector3 } from "three";
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
  if (communityCount <= PALETTE.length)
    return PALETTE[community % PALETTE.length];
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
// Constants
// ---------------------------------------------------------------------------

const LABEL_REF_DIST = 80;
const LABEL_MIN_SCALE = 0.12;
const LABEL_MAX_SCALE = 1.2;

const dummy = new Object3D();
const tempColor = new Color();
const _labelPos = new Vector3();

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
  isDark: boolean;
}

export function GraphNodes({
  nodes,
  communityCount,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
  isDark,
}: GraphNodesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const labelRefs = useRef<(Group | null)[]>([]);

  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    return map;
  }, [nodes]);

  const colors = useMemo(() => {
    return nodes.map(
      (n) => new Color(communityColor(n.community, communityCount)),
    );
  }, [nodes, communityCount]);

  // Bigger nodes: base 1.0, scale up with degree
  const sizes = useMemo(() => {
    return nodes.map((n) => Math.log2(n.degree + 1) * 1.2 + 1.0);
  }, [nodes]);

  // Pre-compute indices for fast integer comparison in useFrame
  const hoveredIdx = useMemo(
    () => (hoveredId ? idToIndex.get(hoveredId) ?? -1 : -1),
    [hoveredId, idToIndex],
  );
  const selectedIdx = useMemo(
    () => (selectedId ? idToIndex.get(selectedId) ?? -1 : -1),
    [selectedId, idToIndex],
  );

  // Single useFrame: instanced mesh + all labels (replaces 2N individual useFrame callbacks)
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const s = sizes[i];
      const isHovered = i === hoveredIdx;
      const isSelected = i === selectedIdx;
      const scale = isHovered || isSelected ? s * 1.5 : s;
      const nx = n.x || 0;
      const ny = n.y || 0;
      const nz = n.z || 0;

      // Instanced mesh
      dummy.position.set(nx, ny, nz);
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

      // Label: position + face camera + distance scale
      const g = labelRefs.current[i];
      if (g) {
        g.position.set(nx, ny + s + 2, nz);
        g.quaternion.copy(camera.quaternion);
        _labelPos.set(nx, ny, nz);
        const dist = camera.position.distanceTo(_labelPos);
        const ls =
          isHovered || isSelected
            ? LABEL_MAX_SCALE
            : Math.max(
                LABEL_MIN_SCALE,
                Math.min(LABEL_MAX_SCALE, LABEL_REF_DIST / dist),
              );
        g.scale.setScalar(ls);
      }
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

      {/* Labels — positioned + face-camera + scaled in batch useFrame above */}
      {nodes.map((n, i) => (
        <group
          key={n.id}
          ref={(el) => {
            labelRefs.current[i] = el;
          }}
          onPointerOver={() => {
            onHover(n.id);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            onHover(null);
            document.body.style.cursor = "auto";
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(n.id);
          }}
        >
          <Text
            fontSize={3.2}
            color={
              hoveredId === n.id || selectedId === n.id
                ? isDark
                  ? "#ffffff"
                  : "#0f172a"
                : isDark
                  ? "#cbd5e1"
                  : "#334155"
            }
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.2}
            outlineColor={isDark ? "#000000" : "#ffffff"}
          >
            {n.id.length > 20 ? n.id.slice(0, 20) + "…" : n.id}
          </Text>
        </group>
      ))}
    </>
  );
}
