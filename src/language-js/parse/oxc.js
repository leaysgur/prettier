import { parseSync as oxcParse } from "oxc-parser";

import createError from "../../common/parser-create-error.js";
import postprocess from "./postprocess/index.js";
import createParser from "./utils/create-parser.js";
import getSourceType from "./utils/get-source-type.js";

const parseOptions = {
  preserveParens: true,
};

function parseWithOptions(text, sourceType) {
  const { program, comments, errors } = oxcParse(text, {
    sourceType,
    ...parseOptions,
  });

  if (errors.length !== 0) throw new Error(errors[0]);

  const ast = JSON.parse(program);
  ast.comments = comments;

  return ast;
}

// TODO: Not sure
function createParseError(error) {
  let { message, line, column } = error;

  const matches = message.match(
    /^\[(?<line>\d+):(?<column>\d+)\]: (?<message>.*)$/u,
  )?.groups;

  if (matches) {
    message = matches.message;

    /* c8 ignore next 4 */
    if (typeof line !== "number") {
      line = Number(matches.line);
      column = Number(matches.column);
    }
  }

  /* c8 ignore next 3 */
  if (typeof line !== "number") {
    return error;
  }

  return createError(message, {
    loc: { start: { line, column } },
    cause: error,
  });
}

function parse(text, options = {}) {
  const sourceType = getSourceType(options);

  let ast;
  try {
    ast = parseWithOptions(text, sourceType);
  } catch (/** @type {any} */ { errors: [error] }) {
    throw createParseError(error);
  }

  return postprocess(ast, { parser: "oxc", text });
}

const oxc = createParser(parse);

export default { oxc };
