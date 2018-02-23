/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

// NOTE:
// put the input fb-www file in ${root}/fb-www/input.js
// the compiled file will be saved to ${root}/fb-www/output.js

let prepackSources = require("../lib/prepack-node.js").prepackSources;
let path = require("path");
let { readFile, writeFile } = require("fs");
let { promisify } = require("util");
let readFileAsync = promisify(readFile);
let writeFileAsync = promisify(writeFile);

let prepackOptions = {
  compatibility: "fb-www",
  internalDebug: true,
  serialize: true,
  uniqueSuffix: "",
  maxStackDepth: 100,
  reactEnabled: true,
  reactOutput: "jsx",
  inlineExpressions: true,
  omitInvariants: true,
  abstractEffectsInAdditionalFunctions: true,
  simpleClosures: true,
};
let inputPath = path.resolve("fb-www/input3.js");
let outputPath = path.resolve("fb-www/output.js");

function compileSource(source) {
  let serialized = prepackSources([{ filePath: "", fileContents: source, sourceMapContents: "" }], prepackOptions);
  return {
    // $FlowFixMe: reactStatistics do exist as we're passing reactEnabled in config
    stats: serialized.reactStatistics,
    code: serialized.code,
  };
}

async function compileFile() {
  let source = await readFileAsync(inputPath, "utf8");
  let { stats, code } = await compileSource(source);
  await writeFileAsync(outputPath, code);
  return stats;
}

compileFile()
  .then(result => {
    console.log("\nCompilation complete!");
    console.log(`Optimized Trees: ${result.optimizedTrees}`);
    console.log(`Inlined Components: ${result.inlinedComponents}`);
  })
  .catch(e => {
    console.error(e.natickStack || e.stack);
    process.exit(1);
  });
