declare module "d3-force-3d" {
  export interface SimulationNodeDatum {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  export interface SimulationLinkDatum<N extends SimulationNodeDatum> {
    source: string | N;
    target: string | N;
    index?: number;
  }

  export interface Simulation<N extends SimulationNodeDatum> {
    force(name: string, force?: Force<N>): Simulation<N>;
    alpha(value?: number): Simulation<N> & number;
    alphaDecay(value?: number): Simulation<N> & number;
    on(event: string, listener: () => void): Simulation<N>;
    stop(): void;
    restart(): void;
    tick(iterations?: number): void;
    nodes(): N[];
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  export interface Force<N extends SimulationNodeDatum> {}

  export interface ForceLink<
    N extends SimulationNodeDatum,
    L extends SimulationLinkDatum<N>,
  > extends Force<N> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    id(accessor: (d: any) => string): ForceLink<N, L>;
    distance(value: number | ((d: L) => number)): ForceLink<N, L>;
    strength(value: number | ((d: L) => number)): ForceLink<N, L>;
  }

  export interface ForceManyBody<
    N extends SimulationNodeDatum,
  > extends Force<N> {
    strength(value: number | ((d: N) => number)): ForceManyBody<N>;
    distanceMin(value: number): ForceManyBody<N>;
    distanceMax(value: number): ForceManyBody<N>;
  }

  export interface ForceCenter<N extends SimulationNodeDatum> extends Force<N> {
    x(value: number): ForceCenter<N>;
    y(value: number): ForceCenter<N>;
    z(value: number): ForceCenter<N>;
  }

  export function forceSimulation<N extends SimulationNodeDatum>(
    nodes?: N[],
    numDimensions?: number,
  ): Simulation<N>;

  export function forceLink<
    N extends SimulationNodeDatum,
    L extends SimulationLinkDatum<N>,
  >(links?: L[]): ForceLink<N, L>;

  export function forceManyBody<
    N extends SimulationNodeDatum,
  >(): ForceManyBody<N>;

  export function forceCenter<N extends SimulationNodeDatum>(
    x?: number,
    y?: number,
    z?: number,
  ): ForceCenter<N>;
}
