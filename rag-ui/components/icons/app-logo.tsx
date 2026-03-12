import type { SVGProps } from "react";

export function AppLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="130 70 252 252"
      fill="none"
      {...props}
    >
      {/* 连接线 */}
      <path
        d="M176 220 L256 160 L336 220 M256 160 L256 280"
        stroke="currentColor"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.25}
      />
      {/* 知识节点 */}
      <circle cx={176} cy={220} r={14} fill="currentColor" />
      <circle cx={336} cy={220} r={14} fill="currentColor" />
      <circle cx={256} cy={280} r={14} fill="currentColor" />
      {/* AI 核心节点 */}
      <circle cx={256} cy={160} r={22} className="fill-primary" />
      {/* 星火 */}
      <path
        d="M 296 110 Q 306 110 306 100 Q 306 110 316 110 Q 306 110 306 120 Q 306 110 296 110 Z"
        className="fill-primary"
      />
    </svg>
  );
}
