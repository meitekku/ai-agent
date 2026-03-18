"use client";

import { useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useTheme } from "next-themes";
import type { GraphData } from "@/lib/rag-client";
import type { SimNode, SimLink } from "@/lib/force-simulation";
import { createSimulation } from "@/lib/force-simulation";
import { GraphNodes } from "./graph-nodes";
import { GraphEdges } from "./graph-edges";
import { GraphEffects } from "./graph-effects";

// ---------------------------------------------------------------------------
// Camera + OrbitControls animation
// ---------------------------------------------------------------------------

function CameraAnimator({
  targetPosition,
  controlsRef,
}: {
  targetPosition: Vector3 | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera, gl } = useThree();
  const targetRef = useRef<Vector3 | null>(null);
  const orbitTarget = useRef(new Vector3());

  useEffect(() => {
    if (targetPosition) {
      targetRef.current = targetPosition.clone();
      orbitTarget.current.copy(targetPosition);
    }
  }, [targetPosition]);

  // Cancel animation when user interacts (drag, scroll, pinch)
  useEffect(() => {
    const cancel = () => {
      targetRef.current = null;
    };
    const el = gl.domElement;
    el.addEventListener("pointerdown", cancel);
    el.addEventListener("wheel", cancel);
    return () => {
      el.removeEventListener("pointerdown", cancel);
      el.removeEventListener("wheel", cancel);
    };
  }, [gl]);

  useFrame(() => {
    if (!targetRef.current) return;

    const nodePos = targetRef.current;
    // Camera goes behind the node (offset on Z)
    const desiredCam = new Vector3(nodePos.x, nodePos.y, nodePos.z + 50);

    camera.position.lerp(desiredCam, 0.05);

    // Also lerp OrbitControls target to the node position
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerp(orbitTarget.current, 0.05);
      controls.update();
    }

    if (camera.position.distanceTo(desiredCam) < 0.5) {
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const [cameraTarget, setCameraTarget] = useState<Vector3 | null>(null);
  const simRef = useRef<ReturnType<typeof createSimulation> | null>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync init from simulation setup
    setSimNodes([...nodes]);

    setSimLinks([...links]);

    return () => {
      sim.stop();
    };
  }, [data]);

  useEffect(() => {
    if (!selectedId) return;
    const node = simNodes.find((n) => n.id === selectedId);
    if (node) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- camera follow selection
      setCameraTarget(new Vector3(node.x || 0, node.y || 0, node.z || 0));
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Canvas
      camera={{ position: [0, 0, cameraZ], fov: 60, near: 0.1, far: 3000 }}
      style={{ background: isDark ? "#030712" : "#f1f5f9" }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={isDark ? 0.4 : 0.6} />
      <pointLight position={[100, 100, 100]} intensity={isDark ? 0.6 : 0.8} />

      <GraphNodes
        nodes={simNodes}
        communityCount={data.stats.community_count}
        hoveredId={hoveredId}
        selectedId={selectedId}
        onHover={onHover}
        onSelect={onSelect}
        isDark={isDark}
      />
      <GraphEdges
        nodes={simNodes}
        links={simLinks}
        hoveredId={hoveredId}
        isDark={isDark}
      />
      <GraphEffects isDark={isDark} />
      <CameraAnimator targetPosition={cameraTarget} controlsRef={controlsRef} />

      <OrbitControls
        ref={controlsRef}
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
