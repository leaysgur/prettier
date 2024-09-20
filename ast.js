import * as Prettier from "./src/index.js";

const parser = process.argv[2] ?? "babel";

const SOURCE = `
`;

const { ast } = await Prettier.__debug.parse(
  SOURCE,
  { parser },
);
console.log(JSON.stringify(ast?.program?.body ?? ast.body, (k, v) => {
  if ([
    "start",
    "end",
    "loc",
    "range",
    "leadingComments",
    "trailingComments",
    "innerComments",
  ].includes(k)) {
    return undefined;
  }
  return v;
}, 2));
console.log({ parser });
