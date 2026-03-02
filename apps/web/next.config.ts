import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // This repo is not the OpenClaw workspace root; ensure Next/Turbopack treats this folder as the app root.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
