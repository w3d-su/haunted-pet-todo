import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

function isNowProperty(member) {
  if (!member.computed && member.property.type === "Identifier") return member.property.name === "now";
  if (member.computed && member.property.type === "Literal") return member.property.value === "now";
  return false;
}

function isGlobalDate(node) {
  if (!node || node.type !== "MemberExpression") return false;
  if (node.object.type !== "Identifier") return false;
  if (node.object.name !== "window" && node.object.name !== "globalThis") return false;
  if (!node.computed && node.property.type === "Identifier") return node.property.name === "Date";
  if (node.computed && node.property.type === "Literal") return node.property.value === "Date";
  return false;
}

/** Value references to the global Date. Date.UTC and Date.parse stay allowed. */
const noWallClock = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      clock: "src/lib/game must not use {{kind}}. Pass a now: number or a Clock.",
    },
  },
  create(context) {
    function isDateAlias(name, node) {
      let scope = context.sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(name);
        if (variable) {
          return variable.defs.some((def) => {
            if (def.node.type !== "VariableDeclarator") return false;
            const init = def.node.init;
            if (!init) return false;
            if (init.type === "Identifier" && init.name === "Date") return true;
            return isGlobalDate(init);
          });
        }
        scope = scope.upper;
      }
      return false;
    }

    function isDateValue(node) {
      if (!node) return false;
      if (node.type === "Identifier" && node.name === "Date") return true;
      if (node.type === "Identifier") return isDateAlias(node.name, node);
      return isGlobalDate(node);
    }

    function report(node, kind) {
      context.report({ node, messageId: "clock", data: { kind } });
    }

    function isTypePosition(node) {
      const parent = node.parent;
      if (!parent) return false;
      return (
        parent.type === "TSTypeReference" ||
        parent.type === "TSTypeQuery" ||
        parent.type === "TSExpressionWithTypeArguments" ||
        parent.type === "TSImportType"
      );
    }

    function allowedClockMember(node) {
      const parent = node.parent;
      if (!parent || parent.type !== "MemberExpression" || parent.object !== node || parent.computed) {
        return false;
      }
      return (
        parent.property.type === "Identifier" &&
        (parent.property.name === "UTC" || parent.property.name === "parse")
      );
    }

    return {
      Identifier(node) {
        if (node.name !== "Date" || isTypePosition(node)) return;
        const parent = node.parent;
        if (parent?.type === "MemberExpression" && parent.property === node) return;
        if (allowedClockMember(node)) return;
        if (parent?.type === "NewExpression" && parent.callee === node) return;
        if (
          parent?.type === "MemberExpression" &&
          parent.object === node &&
          !parent.computed &&
          parent.property.type === "Identifier" &&
          parent.property.name === "now"
        ) {
          return;
        }
        report(node, "Date");
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || !isNowProperty(callee)) return;
        if (!isDateValue(callee.object)) return;
        report(node, "Date.now()");
      },
      NewExpression(node) {
        if (!isDateValue(node.callee)) return;
        report(node, "new Date");
      },
      MemberExpression(node) {
        if (!isGlobalDate(node)) return;
        report(node, `${node.object.name}.Date`);
      },
    };
  },
};

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
