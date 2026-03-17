"use client";

/**
 * Shimmer overlay for widget loading state.
 * Shows during CDN script loading or streaming phase.
 */
export function WidgetShimmer() {
  return (
    <div
      className="absolute inset-0 pointer-events-none rounded-lg"
      style={{
        background:
          "linear-gradient(90deg, transparent 0%, oklch(0.72 0.17 165 / 6%) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-wave 1.5s ease-in-out infinite",
      }}
    />
  );
}
