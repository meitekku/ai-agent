"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import type { GraphData } from "@/lib/rag-client";
import type { SimNode, SimLink } from "@/lib/force-simulation";
import { createSimulation } from "@/lib/force-simulation";
import { GraphNodes } from "./graph-nodes";
import { GraphEdges } from "./graph-edges";
import { GraphEffects } from "./graph-effects";

// ---------------------------------------------------------------------------
// Camera animation helper
// ---------------------------------------------------------------------------

function CameraAnimator({
  targetPosition,
}: {
  targetPosition: Vector3 | null;
}) {
  const { camera } = useThree();
  const targetRef = useRef<Vector3 | null>(null);

  useEffect(() => {
    targetRef.current = targetPosition;
  }, [targetPosition]);

  useFrame(() => {
    if (!targetRef.current) return;
    const target = targetRef.current;
    const desired = new Vector3(target.x, target.y, target.z + 50);
    camera.position.lerp(desired, 0.04);
    if (camera.position.distanceTo(desired) < 0.5) {
      targetRef.current = null;
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------

interface GraphCanvasProps {
  data: GraphData;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

export function GraphCanvas({
  data,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: GraphCanvasProps) {
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const [cameraTarget, setCameraTarget] = useState<Vector3 | null>(null);
  const simRef = useRef<ReturnType<typeof createSimulation> | null>(null);

  // Scale camera distance based on node count
  const cameraZ = Math.max(150, Math.sqrt(data.nodes.length) * 8);

  useEffect(() => {
    const nodes: SimNode[] = data.nodes.map((n) => ({
      id: n.id,
      community: n.community,
      degree: n.degree,
      x: (Math.random() - 0.5) * 20,
      y: (Math.random() - 0.5) * 20,
      z: (Math.random() - 0.5) * 20,
    }));

    const links: SimLink[] = data.links.map((l) => ({
      source: l.source,
      target: l.target,
      weight: l.weight,
    }));

    const sim = createSimulation(nodes, links, () => {
      setSimNodes([...nodes]);
    });

    simRef.current = sim;
    setSimNodes(nodes);
    setSimLinks(links);

    return () => {
      sim.stop();
    };
  }, [data]);

  useEffect(() => {
    if (!selectedId) return;
    const node = simNodes.find((n) => n.id === selectedId);
    if (node) {
      setCameraTarget(new Vector3(node.x || 0, node.y || 0, node.z || 0));
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Canvas
      camera={{ position: [0, 0, cameraZ], fov: 60, near: 0.1, far: 3000 }}
      style={{ background: "#030712" }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[100, 100, 100]} intensity={0.6} />

      <GraphNodes
        nodes={simNodes}
        communityCount={data.stats.community_count}
        hoveredId={hoveredId}
        selectedId={selectedId}
        onHover={onHover}
        onSelect={onSelect}
      />
      <GraphEdges nodes={simNodes} links={simLinks} hoveredId={hoveredId} />
      <GraphEffects />
      <CameraAnimator targetPosition={cameraTarget} />

      <OrbitControls
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.5}
        zoomSpeed={1.2}
        minDistance={10}
        maxDistance={800}
      />
    </Canvas>
  );
}
