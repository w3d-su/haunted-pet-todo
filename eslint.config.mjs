import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import noWallClock from "./eslint/no-wall-clock.mjs";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/lib/game/**/*.ts", "src/lib/game/**/*.tsx"],
    plugins: {
      haunted: { rules: { "no-wall-clock": noWallClock } },
    },
    rules: {
      "haunted/no-wall-clock": "error",
    },
  },
];

export default eslintConfig;
