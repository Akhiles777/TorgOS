import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // В системе несколько lockfile'ов — фиксируем корень на этом проекте.
    root: __dirname,
  },
};

export default nextConfig;
