// Flat ESLint config. eslint-config-next@15.5.4 only ships eslintrc-format
// entry points, so we consume @next/eslint-plugin-next's flat config directly.
import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next/dist/index.js";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  nextPlugin.flatConfig.coreWebVitals,
  ...tseslint.configs.recommended,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),
  {
    rules: {
      // This codebase intentionally uses `any` at a few Prisma/Stripe boundaries.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
