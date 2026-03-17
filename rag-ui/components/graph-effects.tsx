"use client";

import {
  EffectComposer,
  Bloom,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

export function GraphEffects({ isDark }: { isDark: boolean }) {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={isDark ? 0.4 : 0.6}
        luminanceSmoothing={0.9}
        intensity={isDark ? 1.5 : 0.8}
        radius={0.6}
      />
      <Vignette
        darkness={isDark ? 0.3 : 0.12}
        offset={0.5}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}
