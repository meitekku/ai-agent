import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force-3d";

export interface SimNode extends SimulationNodeDatum {
  id: string;
  community: number;
  degree: number;
  x: number;
  y: number;
  z: number;
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  weight: number;
}

export function createSimulation(
  nodes: SimNode[],
  links: SimLink[],
  onTick: (nodes: SimNode[]) => void,
) {
  const sim = forceSimulation(nodes, 3)
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((d) => 30 / (d.weight || 1)),
    )
    .force("charge", forceManyBody().strength(-50))
    .force("center", forceCenter())
    .alpha(1)
    .alphaDecay(0.02)
    .on("tick", () => onTick(nodes));

  return sim;
}
