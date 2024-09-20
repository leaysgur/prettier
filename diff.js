import fastGlob from "fast-glob";
import { readFile } from "node:fs/promises";
import * as Prettier from "./src/index.js";

const jsFilesToCheck = await fastGlob(["./tests/format/js/**/*.js"]);

const counter = {
  total: 0,
  passed: 0,
  failedToParseWontFix: 0,
  failedToParseToBeFixed: 0,
};
const oxcParseErrors = [];
const prettierErrors = [];
for (const file of jsFilesToCheck) {
  const source = await readFile(file, "utf8");

  try {
    await Prettier.__debug.printToDoc(source, { parser: "babel" });
  } catch {
    // Ignore files that fail to parse even with Babel at first
    continue;
  }

  counter.total++;

  try {
    await Prettier.__debug.printToDoc(source, { parser: "oxc" });
  } catch (err) {
    // Babel w/ plugins can parse but OXC can't
    // Error string means OXC diagnostics
    if (typeof err === "string") {
      oxcParseErrors.push([file, err]);
      counter.failedToParseWontFix++;
      continue;
    }

    prettierErrors.push([file, err]);
    counter.failedToParseToBeFixed++;
    continue;
  }

  // TODO: Diff babel doc with oxc doc
  counter.passed++;
}

if (prettierErrors.length !== 0) {
  for (const [file, err] of prettierErrors) {
    console.log();
    console.log("💥", file);
    console.log(err);
    break;
  }
}

console.log();
console.log("RESULTS:", counter);
