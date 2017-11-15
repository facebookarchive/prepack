/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

let fs = require("fs");
let path = require("path");
let { prepackSources } = require("../lib/prepack-node.js");
let babel = require("babel-core");
let React = require("react");
let ReactTestRenderer = require("react-test-renderer");
let { mergeAdacentJSONTextNodes } = require("../lib/utils/json.js");
/* eslint-disable no-undef */
let { expect, describe, it } = global;

let reactTestRoot = path.join(__dirname, "../test/react/");
let prepackOptions = {
  compatibility: "react-mocks",
  errorHandler: diag => "Fail",
  internalDebug: true,
  serialize: true,
  uniqueSuffix: "",
  maxStackDepth: 100,
  reactEnabled: true,
  inlineExpressions: true,
  omitInvariants: true,
};

function compileSourceWithPrepack(source) {
  let code = `(function(){${source}})()`;
  let serialized = prepackSources([{ filePath: "", fileContents: code, sourceMapContents: "" }], prepackOptions);
  if (serialized == null || serialized.reactStatistics == null) {
    throw new Error("React test runner failed during serialization");
  }
  return {
    compiledSource: serialized.code,
    statistics: serialized.reactStatistics,
  };
}

function runSource(source) {
  let codeAfterBabel = babel.transform(source, {
    presets: ["babel-preset-react"],
    plugins: ["transform-object-rest-spread"],
  }).code;
  /* eslint-disable no-new-func */
  let fn = new Function("require", "module", codeAfterBabel);
  let moduleShim = { exports: null };
  let requireShim = name => {
    switch (name) {
      case "react":
        return React;
      default:
        throw new Error(`Unrecognized import: "${name}".`);
    }
  };
  let global = {
    require: requireShim,
    module: moduleShim,
    Object,
    String,
    console,
  };
  try {
    // $FlowFixMe flow doesn't new Function
    fn.call(global, requireShim, moduleShim);
  } catch (e) {
    console.log(codeAfterBabel);
    throw e;
  }
  return moduleShim.exports;
}

async function runTest(directory, name) {
  let source = fs.readFileSync(path.join(reactTestRoot, directory, name)).toString();
  let { compiledSource } = compileSourceWithPrepack(source);

  let A = runSource(source);
  expect(typeof A).toBe("function");
  let B = runSource(compiledSource);
  expect(typeof B).toBe("function");

  let rendererA = ReactTestRenderer.create(null);
  let rendererB = ReactTestRenderer.create(null);

  if (A == null || B == null) {
    throw new Error("React test runner issue");
  }
  // // Use the original version of the test in case transforming messes it up.
  let { getTrials } = A;
  // // Run tests that assert the rendered output matches.
  let resultA = getTrials(rendererA, A);
  let resultB = getTrials(rendererB, B);

  // // the test has returned many values for us to check
  for (let i = 0; i < resultA.length; i++) {
    let [nameA, valueA] = resultA[i];
    let [nameB, valueB] = resultB[i];
    expect(mergeAdacentJSONTextNodes(valueB)).toEqual(mergeAdacentJSONTextNodes(valueA));
    expect(nameB).toEqual(nameA);
  }
}

// Jest tests
let originalConsoleError = console.error;

describe("Test React", () => {
  describe("Functional component folding", () => {
    let directory = "functional-components";

    it("Simple", async () => {
      await runTest(directory, "simple.js");
    });

    it("Simple children", async () => {
      await runTest(directory, "simple-children.js");
    });

    it("Simple refs", async () => {
      await runTest(directory, "simple-refs.js");
    });

    it("Conditional", async () => {
      await runTest(directory, "conditional.js");
    });

    it("Key nesting", async () => {
      await runTest(directory, "key-nesting.js");
    });

    it("Key nesting 2", async () => {
      await runTest(directory, "key-nesting-2.js");
    });

    it("Key nesting 3", async () => {
      await runTest(directory, "key-nesting-3.js");
    });

    it("Key change", async () => {
      await runTest(directory, "key-change.js");
    });

    it("Component type change", async () => {
      await runTest(directory, "type-change.js");
    });

    it("Component type same", async () => {
      await runTest(directory, "type-same.js");
    });

    it("Dynamic props", async () => {
      await runTest(directory, "dynamic-props.js");
    });

    it("Dynamic context", async () => {
      await runTest(directory, "dynamic-context.js");
    });

    it("React.cloneElement", async () => {
      await runTest(directory, "clone-element.js");
    });

    it("Return text", async () => {
      await runTest(directory, "return-text.js");
    });

    it("Return undefined", async () => {
      // this test will cause a React console.error to show
      // we monkey patch it to stop it polluting the test output
      // with a false-negative error
      global.console.error = () => {};
      try {
        await runTest(directory, "return-undefined.js");
      } finally {
        global.console.error = originalConsoleError;
      }
    });

    it("Class component as root", async () => {
      await runTest(directory, "class-root.js");
    });

    it("Class component as root with multiple render methods", async () => {
      await runTest(directory, "class-root-with-render-methods.js");
    });

    it("Class component as root with props", async () => {
      await runTest(directory, "class-root-with-props.js");
    });

    it("Class component as root with state", async () => {
      await runTest(directory, "class-root-with-state.js");
    });

    it("Class component as root with refs", async () => {
      await runTest(directory, "class-root-with-refs.js");
    });

    it("Class component as root with instance variables", async () => {
      await runTest(directory, "class-root-with-instance-vars.js");
    });
  });
});
