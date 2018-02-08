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

function cxShim(...args) {
  let classNames = [];
  for (let arg of args) {
    if (typeof arg === "string") {
      classNames.push(arg);
    } else if (typeof arg === "object" && arg !== null) {
      let keys = Object.keys(arg);
      for (let key of keys) {
        if (arg[key]) {
          classNames.push(key);
        }
      }
    }
  }
  return classNames.join(" ");
}

// assign for tests that use the cx() global
global.cx = cxShim;

function runTestSuite(outputJsx) {
  let reactTestRoot = path.join(__dirname, "../test/react/");
  let prepackOptions = {
    compatibility: "fb-www",
    internalDebug: true,
    serialize: true,
    uniqueSuffix: "",
    maxStackDepth: 100,
    reactEnabled: true,
    reactOutput: outputJsx ? "jsx" : "create-element",
    inlineExpressions: true,
    omitInvariants: true,
    abstractEffectsInAdditionalFunctions: true,
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
    let transformedSource = babel.transform(source, {
      presets: ["babel-preset-react"],
      plugins: ["transform-object-rest-spread"],
    }).code;
    /* eslint-disable no-new-func */
    let fn = new Function("require", "module", transformedSource);
    let moduleShim = { exports: null };
    let requireShim = name => {
      switch (name) {
        case "React":
        case "react":
          return React;
        case "RelayModern":
          return {
            QueryRenderer(props) {
              return props.render({ props: {}, error: null });
            },
            createFragmentContainer() {
              return null;
            },
            graphql() {
              return null;
            },
          };
        case "cx":
          return cxShim;
        case "FBEnvironment":
          return {};
        default:
          throw new Error(`Unrecognized import: "${name}".`);
      }
    };
    try {
      // $FlowFixMe flow doesn't new Function
      fn(requireShim, moduleShim);
    } catch (e) {
      console.error(transformedSource);
      throw e;
    }
    return moduleShim.exports;
  }

  async function runTest(directory, name) {
    let source = fs.readFileSync(path.join(reactTestRoot, directory, name)).toString();
    let { compiledSource, statistics } = compileSourceWithPrepack(source);

    expect(statistics).toMatchSnapshot();
    let A = runSource(source);
    let B = runSource(compiledSource);

    expect(typeof A).toBe(typeof B);
    if (typeof A !== "function") {
      // Test without exports just verifies that the file compiles.
      return;
    }

    let rendererA = ReactTestRenderer.create(null);
    let rendererB = ReactTestRenderer.create(null);
    if (A == null || B == null) {
      throw new Error("React test runner issue");
    }
    // Use the original version of the test in case transforming messes it up.
    let { getTrials } = A;
    // Run tests that assert the rendered output matches.
    let resultA = getTrials(rendererA, A);
    let resultB = getTrials(rendererB, B);

    // The test has returned many values for us to check
    for (let i = 0; i < resultA.length; i++) {
      let [nameA, valueA] = resultA[i];
      let [nameB, valueB] = resultB[i];
      expect(mergeAdacentJSONTextNodes(valueB)).toEqual(mergeAdacentJSONTextNodes(valueA));
      expect(nameB).toEqual(nameA);
    }
  }

  // Jest tests
  let originalConsoleError = console.error;

  describe(`Test React (${outputJsx ? "JSX" : "create-element"})`, () => {
    describe("Functional component folding", () => {
      let directory = "functional-components";

      it("Simple", async () => {
        await runTest(directory, "simple.js");
      });

      it("Simple 2", async () => {
        await runTest(directory, "simple-2.js");
      });

      it("Simple 3", async () => {
        await runTest(directory, "simple-3.js");
      });

      it("Simple 4", async () => {
        await runTest(directory, "simple-4.js");
      });

      it("Simple 5", async () => {
        await runTest(directory, "simple-5.js");
      });

      it("Simple 6", async () => {
        await runTest(directory, "simple-6.js");
      });

      it("Simple children", async () => {
        await runTest(directory, "simple-children.js");
      });

      it("Simple refs", async () => {
        await runTest(directory, "simple-refs.js");
      });

      it("Circular reference", async () => {
        await runTest(directory, "circular-reference.js");
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

      it("Class component as root with instance variables #2", async () => {
        await runTest(directory, "class-root-with-instance-vars-2.js");
      });

      it("Additional functions closure scope capturing", async () => {
        await runTest(directory, "additional-function-regression.js");
      });
    });

    describe("Class component folding", () => {
      let directory = "class-components";

      it("Simple classes", async () => {
        await runTest(directory, "simple-classes.js");
      });

      it("Simple classes #2", async () => {
        await runTest(directory, "simple-classes-2.js");
      });

      it("Simple classes #3", async () => {
        await runTest(directory, "simple-classes-3.js");
      });

      it("Inheritance chaining", async () => {
        await runTest(directory, "inheritance-chain.js");
      });

      it("Classes with state", async () => {
        await runTest(directory, "classes-with-state.js");
      });
    });

    describe("Factory class component folding", () => {
      let directory = "factory-components";

      it("Simple factory classes", async () => {
        await runTest(directory, "simple.js");
      });

      it("Simple factory classes 2", async () => {
        await runTest(directory, "simple2.js");
      });
    });

    describe("fb-www mocks", () => {
      let directory = "mocks";

      it("fb-www", async () => {
        await runTest(directory, "fb1.js");
      });

      it("fb-www 2", async () => {
        await runTest(directory, "fb2.js");
      });

      it("fb-www 3", async () => {
        await runTest(directory, "fb3.js");
      });

      it("fb-www 4", async () => {
        await runTest(directory, "fb4.js");
      });

      it("fb-www 5", async () => {
        await runTest(directory, "fb5.js");
      });

      it("fb-www 6", async () => {
        await runTest(directory, "fb6.js");
      });
    });
  });
}

runTestSuite(true);
runTestSuite(false);
