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
    // Copied verbatim from the React Bits registry (reactbits.dev/r/*-TS-TW.json).
    // Kept identical to upstream so it can be re-pulled; its ref-in-render
    // patterns trip the React 19 hooks rules, which we do not patch locally.
    "src/components/react-bits/**",
  ]),
]);

export default eslintConfig;
