/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

const vm = require("vm");
const { prepackSources } = require("../../lib/prepack-node.js");

function executeNormal(code) {
  const context = createVmContext();
  vm.runInContext(code, context);
  const inspect = context.module.exports;
  try {
    const value = inspect();
    return { error: false, value };
  } catch (error) {
    return { error: true, value: error };
  }
}

function executePrepack(code) {
  let prepackedCode;
  try {
    prepackedCode = prepackSources([{ fileContents: code, filePath: "test.js" }], prepackOptions).code;
  } catch (error) {
    return { error: true, value: error };
  }
  const context = createVmContext();
  vm.runInContext(prepackedCode, context);
  const inspect = context.module.exports;
  try {
    const value = inspect();
    return { error: false, value };
  } catch (error) {
    return { error: true, value: error };
  }
}

function createVmContext() {
  const sandbox = {
    module: { exports: {} },
  };
  sandbox.global = sandbox;
  return vm.createContext(sandbox);
}

const prepackOptions = {
  errorHandler: diag => {
    if (diag.severity === "Information") return "Recover";
    if (diag.errorCode === "PP0025") return "Recover";
    if (diag.severity !== "Warning") return "Fail";
    return "Recover";
  },
  compatibility: "fb-www",
  internalDebug: true,
  serialize: true,
  uniqueSuffix: "",
  maxStackDepth: 100,
  instantRender: false,
  reactEnabled: true,
  reactOutput: "create-element",
  reactVerbose: true,
  reactOptimizeNestedFunctions: false,
  inlineExpressions: true,
  invariantLevel: 3,
  abstractValueImpliesMax: 1000,
};

module.exports = {
  executeNormal,
  executePrepack,
};
