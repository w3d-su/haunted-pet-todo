const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"]);

function isNowProperty(member) {
  if (!member.computed && member.property.type === "Identifier") return member.property.name === "now";
  if (member.computed && member.property.type === "Literal") return member.property.value === "now";
  return false;
}

function isDateProperty(member) {
  if (!member.computed && member.property.type === "Identifier") return member.property.name === "Date";
  if (member.computed && member.property.type === "Literal") return member.property.value === "Date";
  return false;
}

function isInstanceType(node) {
  const parent = node.parent;
  return parent?.type === "BinaryExpression" && parent.operator === "instanceof" && parent.right === node;
}

/** Date used as a name, not as the global value. `{ Date }` in an object expression still counts. */
function isNonValueDate(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (isInstanceType(node)) return true;
  if (parent.type === "Property" && parent.key === node && !parent.computed) {
    if (parent.shorthand && parent.parent?.type === "ObjectExpression") return false;
    return true;
  }
  if (
    (parent.type === "PropertyDefinition" ||
      parent.type === "MethodDefinition" ||
      parent.type === "TSPropertySignature" ||
      parent.type === "TSMethodSignature") &&
    parent.key === node &&
    !parent.computed
  ) {
    return true;
  }
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
    function findVariable(name, node) {
      let scope = context.sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(name);
        if (variable) return variable;
        scope = scope.upper;
      }
      return null;
    }

    function isGlobalObjectReference(node, seen = new Set()) {
      if (!node || node.type !== "Identifier") return false;
      if (seen.has(node.name)) return false;
      const variable = findVariable(node.name, node);
      // ESLint records globalThis with an empty def list. window and self are often unbound.
      if (!variable || variable.defs.length === 0) return GLOBAL_OBJECTS.has(node.name);
      seen.add(node.name);
      return variable.defs.some((def) => {
        if (def.node.type !== "VariableDeclarator") return false;
        const init = def.node.init;
        return Boolean(init && isGlobalObjectReference(init, seen));
      });
    }

    function isGlobalDate(node) {
      if (!node || node.type !== "MemberExpression") return false;
      if (!isGlobalObjectReference(node.object)) return false;
      return isDateProperty(node);
    }

    function isDateAlias(name, node, seen = new Set()) {
      if (seen.has(name)) return false;
      const variable = findVariable(name, node);
      if (!variable) return false;
      seen.add(name);
      return variable.defs.some((def) => {
        if (def.node.type !== "VariableDeclarator") return false;
        const init = def.node.init;
        if (!init) return false;
        if (init.type === "Identifier") {
          if (init.name === "Date") return true;
          return isDateAlias(init.name, init, seen);
        }
        return isGlobalDate(init);
      });
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

    // Date.now() is reported by CallExpression. Other uses of the member are not calls.
    function isDirectNowCall(member) {
      const parent = member.parent;
      return parent?.type === "CallExpression" && parent.callee === member;
    }

    function globalDateLabel(node) {
      return node.object.type === "Identifier" ? `${node.object.name}.Date` : "Date";
    }

    return {
      Identifier(node) {
        if (node.name !== "Date" || isTypePosition(node)) return;
        const parent = node.parent;
        if (parent?.type === "MemberExpression" && parent.property === node) return;
        if (isNonValueDate(node)) return;
        if (allowedClockMember(node)) return;
        if (parent?.type === "NewExpression" && parent.callee === node) return;
        if (parent?.type === "MemberExpression" && parent.object === node && isNowProperty(parent)) {
          if (isDirectNowCall(parent)) return;
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
        if (!isGlobalDate(node) || isInstanceType(node)) return;
        const parent = node.parent;
        if (parent?.type === "NewExpression" && parent.callee === node) return;
        if (parent?.type === "CallExpression" && parent.callee === node) return;
        if (parent?.type === "MemberExpression" && parent.object === node && isNowProperty(parent)) {
          if (isDirectNowCall(parent)) return;
        }
        report(node, globalDateLabel(node));
      },
    };
  },
};

export default noWallClock;
