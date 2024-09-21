import isNonEmptyArray from "../../../utils/is-non-empty-array.js";
import { locEnd, locStart } from "../../loc.js";
import isBlockComment from "../../utils/is-block-comment.js";
import isIndentableBlockComment from "../../utils/is-indentable-block-comment.js";
import isTypeCastComment from "../../utils/is-type-cast-comment.js";
import visitNode from "./visit-node.js";

/**
 * @param {{
 *   text: string,
 *   parser?: string,
 * }} options
 */
function postprocess(ast, options) {
  const { parser, text } = options;

  // `InterpreterDirective` from babel parser
  // Other parsers parse it as comment, babel treat it as comment too
  // https://github.com/babel/babel/issues/15116
  if (ast.type === "File" && ast.program.interpreter) {
    const {
      program: { interpreter },
      comments,
    } = ast;
    delete ast.program.interpreter;
    comments.unshift(interpreter);
  }

  // OXC AST > Babel AST
  if (parser === "oxc") {
    const modify = (node) => {
      if (!node) return node;

      if (node.type === "StringLiteral")
        return { ...node, extra: { raw: `"${node.value}"` } };
      if (node.type === "NumericLiteral")
        return { ...node, extra: { raw: node.raw } };
      if (node.type === "BigIntLiteral")
        return { ...node, extra: { raw: node.raw } };
      if (node.type === "RegExpLiteral") return { ...node, ...node.regex };
      if (node.type === "JSXText")
        return { ...node, type: "JSXText", extra: { raw: node.value } };

      if (node.type === "FunctionBody")
        return {
          ...node,
          type: "BlockStatement",
          body: node.statements.map((node) => modify(node)),
          statements: undefined,
        };
      if (node.type === "CatchClause" && node.param)
        return { ...node, param: modify(node.param.pattern) };

      if (node.type === "FormalParameters")
        return node.items.map((node) => modify(node));
      if (node.type === "FormalParameter") return modify(node.pattern);

      if (node.type === "AssignmentTargetPropertyProperty")
        return {
          ...node,
          type: "ObjectProperty",
          key: node.name,
          value: modify(node.binding),
        };
      if (node.type === "AssignmentTargetWithDefault")
        return {
          ...node,
          type: "AssignmentPattern",
          left: modify(node.binding),
          right: node.init,
        };

      if (node.type === "ArrowFunctionExpression")
        return {
          ...node,
          params: modify(node.params),
          body: modify(node.body),
        };
      if (node.type === "ConditionalExpression")
        return {
          ...node,
          consequent: modify(node.consequent),
          alternate: modify(node.alternate),
        };
      if (node.type === "CallExpression")
        return {
          ...node,
          callee: modify(node.callee),
          arguments: node.arguments.map((node) => modify(node)),
        };
      if (node.type === "BinaryExpression")
        return {
          ...node,
          left: modify(node.left),
          right: modify(node.right),
        };
      if (
        ["StaticMemberExpression", "PrivateFieldExpression"].includes(node.type)
      )
        return {
          ...node,
          type: "MemberExpression",
          object: modify(node.object),
          property: modify(node.property),
        };
      if (node.type === "ComputedMemberExpression")
        return {
          ...node,
          type: "MemberExpression",
          object: modify(node.object),
          property: modify(node.expression),
          expression: undefined,
        };
      if (node.type === "PrivateInExpression")
        return { ...node, type: "BinaryExpression" };

      if (node.type === "AssignmentPattern")
        return {
          ...node,
          left: modify(node.left),
          right: modify(node.right),
        };
      if (node.type === "ObjectPattern")
        return {
          ...node,
          properties: node.properties.map((node) => ({
            ...modify(node),
            key: modify(node.key),
            value: modify(node.value),
            type: "ObjectProperty",
          })),
        };
      if (node.type === "ObjectProperty")
        return {
          ...node,
          type: "ObjectMethod",
          params: (node.value.params?.items ?? []).map((node) => modify(node)),
          body: modify(node.value.body),
          value: undefined,
        };
      if (node.type === "MethodDefinition")
        return {
          ...node,
          type: "ClassMethod",
          params: (node.value.params?.items ?? []).map((node) => modify(node)),
          body: modify(node.value.body),
          value: undefined,
        };
      if (node.type === "BindingProperty")
        return { ...node, type: "ObjectProperty" };
      if (node.type === "ArrayAssignmentTarget")
        return { ...node, type: "ArrayPattern" };
      if (node.type === "ObjectAssignmentTarget")
        return { ...node, type: "ObjectPattern" };

      return node;
    };
    ast = visitNode(ast, (node) => modify(node));

    // convert utf8 span to utf16
    const utf8Text = new TextEncoder().encode(text);
    const decoder = new TextDecoder();
    ast = visitNode(ast, (node) => {
      node.start = decoder.decode(utf8Text.slice(0, node.start)).length;
      node.end = decoder.decode(utf8Text.slice(0, node.end)).length;
    });
    ast.comments.forEach((node) => {
      node.start = decoder.decode(utf8Text.slice(0, node.start)).length;
      node.end = decoder.decode(utf8Text.slice(0, node.end)).length;
    });
  }

  // Keep Babel's non-standard ParenthesizedExpression nodes only if they have Closure-style type cast comments.
  if (parser === "babel" || parser === "oxc") {
    const startOffsetsOfTypeCastedNodes = new Set();

    // Comments might be attached not directly to ParenthesizedExpression but to its ancestor.
    // E.g.: /** @type {Foo} */ (foo).bar();
    // Let's use the fact that those ancestors and ParenthesizedExpression have the same start offset.

    ast = visitNode(ast, (node) => {
      if (node.leadingComments?.some(isTypeCastComment)) {
        startOffsetsOfTypeCastedNodes.add(locStart(node));
      }
    });

    ast = visitNode(ast, (node) => {
      if (node.type === "ParenthesizedExpression") {
        const { expression } = node;

        // Align range with `flow`
        if (expression.type === "TypeCastExpression") {
          expression.range = [...node.range];
          return expression;
        }

        const start = locStart(node);
        if (!startOffsetsOfTypeCastedNodes.has(start)) {
          expression.extra = { ...expression.extra, parenthesized: true };
          return expression;
        }
      }
    });
  }

  ast = visitNode(ast, (node) => {
    switch (node.type) {
      case "LogicalExpression":
        // We remove unneeded parens around same-operator LogicalExpressions
        if (isUnbalancedLogicalTree(node)) {
          return rebalanceLogicalTree(node);
        }
        break;

      // fix unexpected locEnd caused by --no-semi style
      case "VariableDeclaration": {
        const lastDeclaration = node.declarations.at(-1);
        if (lastDeclaration?.init && text[locEnd(lastDeclaration)] !== ";") {
          node.range = [locStart(node), locEnd(lastDeclaration)];
        }
        break;
      }
      // remove redundant TypeScript nodes
      case "TSParenthesizedType":
        return node.typeAnnotation;

      case "TSTypeParameter":
        // babel-ts
        if (typeof node.name === "string") {
          const start = locStart(node);
          node.name = {
            type: "Identifier",
            name: node.name,
            range: [start, start + node.name.length],
          };
        }
        break;

      // For hack-style pipeline
      case "TopicReference":
        ast.extra = { ...ast.extra, __isUsingHackPipeline: true };
        break;

      case "ExportAllDeclaration":
        // TODO: Remove this when https://github.com/meriyah/meriyah/issues/200 get fixed
        if (parser === "meriyah" && node.exported?.type === "Identifier") {
          const { exported } = node;
          const raw = text.slice(locStart(exported), locEnd(exported));
          if (raw.startsWith('"') || raw.startsWith("'")) {
            node.exported = {
              ...node.exported,
              type: "Literal",
              value: node.exported.name,
              raw,
            };
          }
        }
        break;

      // In Flow parser, it doesn't generate union/intersection types for single type
      case "TSUnionType":
      case "TSIntersectionType":
        if (node.types.length === 1) {
          return node.types[0];
        }
        break;
    }
  });

  if (isNonEmptyArray(ast.comments)) {
    let followingComment = ast.comments.at(-1);
    for (let i = ast.comments.length - 2; i >= 0; i--) {
      const comment = ast.comments[i];
      if (
        locEnd(comment) === locStart(followingComment) &&
        isBlockComment(comment) &&
        isBlockComment(followingComment) &&
        isIndentableBlockComment(comment) &&
        isIndentableBlockComment(followingComment)
      ) {
        ast.comments.splice(i + 1, 1);
        comment.value += "*//*" + followingComment.value;
        comment.range = [locStart(comment), locEnd(followingComment)];
      }
      followingComment = comment;
    }
  }

  // In `typescript`/`espree`/`flow`, `Program` doesn't count whitespace and comments
  // See https://github.com/eslint/espree/issues/488
  if (ast.type === "Program") {
    ast.range = [0, text.length];
  }
  return ast;
}

function isUnbalancedLogicalTree(node) {
  return (
    node.type === "LogicalExpression" &&
    node.right.type === "LogicalExpression" &&
    node.operator === node.right.operator
  );
}

function rebalanceLogicalTree(node) {
  if (!isUnbalancedLogicalTree(node)) {
    return node;
  }

  return rebalanceLogicalTree({
    type: "LogicalExpression",
    operator: node.operator,
    left: rebalanceLogicalTree({
      type: "LogicalExpression",
      operator: node.operator,
      left: node.left,
      right: node.right.left,
      range: [locStart(node.left), locEnd(node.right.left)],
    }),
    right: node.right.right,
    range: [locStart(node), locEnd(node)],
  });
}

export default postprocess;
