import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "src/lib/game must not call Date.now(). Pass a now: number or a Clock.",
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "src/lib/game must not call new Date(). Pass a now: number or a Clock.",
        },
        {
          selector: "MemberExpression[object.name='globalThis'][property.name='Date']",
          message:
            "src/lib/game must not reference globalThis.Date. Pass a now: number or a Clock.",
        },
      ],
    },
  },
];

export default eslintConfig;
