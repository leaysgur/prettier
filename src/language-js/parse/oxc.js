import { parseSync as oxcParse } from "oxc-parser";

import createError from "../../common/parser-create-error.js";
import postprocess from "./postprocess/index.js";
import createParser from "./utils/create-parser.js";
import getSourceType from "./utils/get-source-type.js";

const parseOptions = {
  sourceFilename: "all.jsx",
  preserveParens: true,
};

function parseWithOptions(text, sourceType) {
  const { program, comments, errors } = oxcParse(text, {
    sourceType,
    ...parseOptions,
  });

  if (errors.length !== 0) throw { errors };

  const ast = JSON.parse(program);
  ast.comments = comments;

  return ast;
}

// Errors do not have line, column.
// But instead, error message contains them.
function createParseError(error) {
  return error;
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
