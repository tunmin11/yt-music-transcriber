import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Self-contained server build for Docker (see Dockerfile).
  output: "standalone",
  // Load TensorFlow.js + Basic Pitch with Node's require so the model files
  // inside the package (and the optional native tfjs-node backend) resolve at runtime.
  serverExternalPackages: ["@tensorflow/tfjs", "@tensorflow/tfjs-node", "@tensorflow/tfjs-backend-wasm", "@spotify/basic-pitch"],
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@spotify/basic-pitch/model/**", "./node_modules/@tensorflow/tfjs-backend-wasm/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
