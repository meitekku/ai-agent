import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_LLM_BACKEND: process.env.GEMINI_API_KEY ? "Gemini" : "MLX",
  },
};

export default nextConfig;
