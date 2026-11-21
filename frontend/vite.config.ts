import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const api = (env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");
  return {
    base: env.VITE_BASE || "/",
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: env.VITE_API_URL
        ? undefined
        : {
            "/api": api,
          },
    },
  };
});
