import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Saída do build da Netlify (netlify dev / deploy local)
    ".netlify/**",
    // Worker minificado do pdfjs, copiado de node_modules no postinstall
    "public/pdf.worker.min.mjs",
  ]),
]);

export default eslintConfig;
