import path from "node:path";
import { defineConfig, loadEnv } from "vite";

function normalizeEnvValue(value) {
  return String(value || "").trim();
}

function resolveGoogleWebClientId(mode) {
  const webEnv = loadEnv(mode, __dirname, "");
  const repoRoot = path.resolve(__dirname, "..");
  const rootEnv = loadEnv(mode, repoRoot, "");

  return normalizeEnvValue(
    webEnv.VITE_GOOGLE_WEB_CLIENT_ID ||
      webEnv.GOOGLE_WEB_CLIENT_ID ||
      rootEnv.VITE_GOOGLE_WEB_CLIENT_ID ||
      rootEnv.GOOGLE_WEB_CLIENT_ID ||
      "",
  );
}

export default defineConfig(({ mode }) => {
  const resolvedGoogleWebClientId = resolveGoogleWebClientId(mode);

  return {
    define: {
      "import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID": JSON.stringify(resolvedGoogleWebClientId),
    },
  };
});
