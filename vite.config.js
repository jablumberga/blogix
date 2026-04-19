import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false },
  server: {
    cors: true,
    proxy: {
      "/api": {
        target: "http://localhost:8888",
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["access-control-allow-origin"] = "*";
            proxyRes.headers["access-control-allow-methods"] = "GET,POST,PUT,DELETE,OPTIONS";
            proxyRes.headers["access-control-allow-headers"] = "Content-Type, Authorization";
          });
        },
      },
    },
  },
});
