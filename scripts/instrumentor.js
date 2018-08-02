/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import * as t from "@babel/types";
import generate from "@babel/generator";
import traverseFast from "../lib/utils/traverse-fast.js";
import { parse } from "@babel/parser";
let fs = require("fs");
import type { BabelNodeSourceLocation, BabelNodeBlockStatement } from "@babel/types";

function createLogStatement(loc: BabelNodeSourceLocation) {
  return t.expressionStatement(
    t.callExpression(t.memberExpression(t.identifier("console"), t.identifier("log")), [
      t.stringLiteral(`[instrumentation] #${loc.start.line}`),
    ])
  );
}

function instrument(inputFilename: string, outputFilename: string) {
  let code = fs.readFileSync(inputFilename, "utf8");
  let ast = parse(code, { inputFilename, sourceType: "script" });
  traverseFast(ast, function(node) {
    if (node.type === "BlockStatement") {
      if (node.loc) ((node: any): BabelNodeBlockStatement).body.unshift(createLogStatement(node.loc));
    }
    return false;
  });
  code = generate(ast, {}, "").code;
  if (!outputFilename) outputFilename = inputFilename + "-instrumented.js";
  fs.writeFileSync(outputFilename, code);
  console.log(`Instrumented source code written to ${outputFilename}.`);
}

let args = Array.from(process.argv);
args.splice(0, 2);
let inputFilename;
let outputFilename;
while (args.length) {
  let arg = args[0];
  args.shift();
  if (arg === "--out") {
    arg = args[0];
    args.shift();
    outputFilename = arg;
  } else if (arg === "--help") {
    console.log("Usage: instrumentor.js [ --out output.js ] [ -- | input.js ]");
  } else if (!arg.startsWith("--")) {
    inputFilename = arg;
  } else {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  }
}

if (!inputFilename) {
  console.error("Missing input file.");
  process.exit(1);
} else if (!outputFilename) {
  console.error("Missing output file.");
  process.exit(1);
} else {
  instrument(inputFilename, outputFilename);
}
