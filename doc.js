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

  let bblStr;
  try {
    const bblDoc = await Prettier.__debug.printToDoc(source, {
      parser: "babel",
    });
    bblStr = await Prettier.__debug.printDocToString(bblDoc, {
      parser: "babel",
    }).formatted;
  } catch {
    // Ignore files that fail to parse even with Babel at first
    continue;
  }

  counter.total++;

  let oxcStr;
  try {
    const oxcDoc = await Prettier.__debug.printToDoc(source, { parser: "oxc" });
    oxcStr = await Prettier.__debug.printDocToString(oxcDoc, { parser: "oxc" })
      .formatted;
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

  if (bblStr === oxcStr) {
    counter.passed++;
  }
}

if (prettierErrors.length !== 0) {
  for (const [file, err] of prettierErrors) {
    if (String(err).includes("Comment")) continue;
    console.log();
    console.log("💥", file);
    console.log(err);
  }
}

console.log();
console.log(
  "RESULTS:",
  (counter.passed / counter.total * 100).toFixed(2) + "%",
  counter,
);
