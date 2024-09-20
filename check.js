import fastGlob from "fast-glob";
import { readFile } from "node:fs/promises";
import * as Prettier from "./src/index.js";

const jsFiles = await fastGlob([
  "./tests/format/js/**/*.js",
  "!**/format.test.js",
]);

const oxcParseErrors = [];
const prettierErrors = [];
for (const file of jsFiles.sort()) {
  const source = await readFile(file, "utf8");

  try {
    const _doc = await Prettier.__debug.printToDoc(source, { parser: "oxc" });
    console.log("✅", file);
  } catch (err) {
    if (typeof err === "string") {
      oxcParseErrors.push([file, err]);
    } else {
      prettierErrors.push([file, err]);
    }
  }
}

if (prettierErrors.length !== 0) {
  for (const [file, err] of prettierErrors) {
    console.error(file);
    console.error(err);
  }
  console.error("👻 Failed to parse", prettierErrors.length, "files");
}

console.log();
console.log(jsFiles.length, "files checked");
console.log(oxcParseErrors.length, "files failed to parse with OXC");
console.log(prettierErrors.length, "files failed to parse with Prettier");
