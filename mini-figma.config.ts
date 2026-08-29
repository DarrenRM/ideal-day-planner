import { defineMiniFigmaConfig } from "@mini-figma/vite";

export default defineMiniFigmaConfig({
  projectName: "Ideal Day",
  runtimeEntry: "app/components/component-library-page.tsx",
  include: ["app/"],
  exclude: ["app/api/", "worker/", "bridge/", "vercel-gateway/"],
  tokenFiles: ["app/globals.css"],
  viewports: [
    { name: "Wide", width: 1440, height: 900 },
    { name: "Desktop", width: 1040, height: 820 },
    { name: "Tablet", width: 800, height: 900 },
    { name: "Compact", width: 680, height: 860 },
    { name: "Mobile", width: 430, height: 860 },
    { name: "Small", width: 360, height: 800 },
  ],
  exportDirectory: ".mini-figma/exports",
  validationCommands: ["npm run build", "npm test", "npm run lint"],
});
