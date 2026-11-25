import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxy = {
  "/api": {
    target: "http://localhost:9011",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  // Dev server (npm run dev). strictPort = fail loudly if 9012 is already in
  // use rather than silently moving to another port (which looks like "nothing
  // happened" because nginx still points at 9012).
  server: {
    port: 9012,
    strictPort: true,
    proxy: apiProxy,
  },
  // Production preview of the built app (npm run preview / PM2).
  preview: {
    port: 9012,
    strictPort: true,
    host: true,
    // vite preview blocks requests whose Host header isn't allow-listed;
    // nginx forwards the public hostname, so permit the subdomain.
    allowedHosts: [
      "interview-assistant.candidatesbridge.com",
      "www.interview-assistant.candidatesbridge.com",
    ],
    proxy: apiProxy,
  },
});
