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
let PropTypes = require("prop-types");
let ReactRelay = require("react-relay");
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

function getDataFile(directory, name) {
  let reactTestRoot = path.join(__dirname, "../test/react/");
  let data = fs.readFileSync(path.join(reactTestRoot, directory, name)).toString();
  return data;
}

function runTestSuite(outputJsx, shouldTranspileSource) {
  let errorsCaptured = [];
  let reactTestRoot = path.join(__dirname, "../test/react/");
  let prepackOptions = {
    errorHandler: diag => {
      errorsCaptured.push(diag);
      return "Fail";
    },
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
    stripFlow: true,
  };

  function compileSourceWithPrepack(source) {
    let code = `(function(){${source}})()`;
    let serialized;
    errorsCaptured = [];
    try {
      serialized = prepackSources([{ filePath: "", fileContents: code, sourceMapContents: "" }], prepackOptions);
    } catch (e) {
      errorsCaptured.forEach(error => {
        console.error(error);
      });
      throw e;
    }
    if (serialized == null || serialized.reactStatistics == null) {
      throw new Error("React test runner failed during serialization");
    }
    return {
      compiledSource: serialized.code,
      statistics: serialized.reactStatistics,
    };
  }

  function transpileSource(source) {
    return babel.transform(source, {
      presets: ["babel-preset-react"],
      plugins: ["transform-object-rest-spread"],
    }).code;
  }

  function runSource(source) {
    let transformedSource = transpileSource(source);
    /* eslint-disable no-new-func */
    let fn = new Function("require", "module", transformedSource);
    let moduleShim = { exports: null };
    let requireShim = name => {
      switch (name) {
        case "React":
        case "react":
          return React;
        case "PropTypes":
        case "prop-types":
          return PropTypes;
        case "RelayModern":
          return ReactRelay;
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

  async function runTest(directory, name, firstRenderOnly = false, data) {
    let source = fs.readFileSync(path.join(reactTestRoot, directory, name)).toString();
    if (shouldTranspileSource) {
      source = transpileSource(source);
    }
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
    let resultA = getTrials(rendererA, A, data);
    let resultB = getTrials(rendererB, B, data);

    // The test has returned many values for us to check
    for (let i = 0; i < resultA.length; i++) {
      let [nameA, valueA] = resultA[i];
      let [nameB, valueB] = resultB[i];
      expect(mergeAdacentJSONTextNodes(valueB, firstRenderOnly)).toEqual(
        mergeAdacentJSONTextNodes(valueA, firstRenderOnly)
      );
      expect(nameB).toEqual(nameA);
    }
  }

  async function stubReactRelay(f) {
    let oldReactRelay = ReactRelay;
    ReactRelay = {
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
    try {
      await f();
    } finally {
      ReactRelay = oldReactRelay;
    }
  }

  // Jest tests
  let originalConsoleError = global.console.error;
  // we don't want React's errors printed, it's too much noise
  let excludeErrorsContaining = [
    "Nothing was returned from render. This usually means a return statement is missing. Or, to render nothing, return null",
    "Consider adding an error boundary to your tree to customize error handling behavior.",
    "Warning:",
  ];
  global.console.error = function(...args) {
    let text = args[0];

    if (typeof text === "string") {
      for (let excludeError of excludeErrorsContaining) {
        if (text.indexOf(excludeError) !== -1) {
          return;
        }
      }
    }
    originalConsoleError.apply(this, args);
  };

  describe(`Test React with ${shouldTranspileSource ? "create-element input" : "JSX input"}, ${outputJsx
    ? "JSX output"
    : "create-element output"}`, () => {
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

      it("Simple 7", async () => {
        await runTest(directory, "simple-7.js");
      });

      it("Simple fragments", async () => {
        await runTest(directory, "simple-fragments.js");
      });

      it("Simple children", async () => {
        await runTest(directory, "simple-children.js");
      });

      it("Simple refs", async () => {
        await runTest(directory, "simple-refs.js");
      });

      it("Simple with abstract props", async () => {
        await runTest(directory, "simple-with-abstract-props.js");
      });

      it("Simple with unary expressions", async () => {
        await runTest(directory, "simple-with-unary.js");
      });

      it("Simple with multiple JSX spreads", async () => {
        await runTest(directory, "simple-with-jsx-spread.js");
      });

      it("Simple with multiple JSX spreads #2", async () => {
        await runTest(directory, "simple-with-jsx-spread2.js");
      });

      it("Simple with multiple JSX spreads #3", async () => {
        await runTest(directory, "simple-with-jsx-spread3.js");
      });

      it("Simple with multiple JSX spreads #4", async () => {
        await runTest(directory, "simple-with-jsx-spread4.js");
      });

      it("Simple with multiple JSX spreads #5", async () => {
        await runTest(directory, "simple-with-jsx-spread5.js");
      });

      it("Simple with multiple JSX spreads #6", async () => {
        await runTest(directory, "simple-with-jsx-spread6.js");
      });

      it("Simple with Object.assign", async () => {
        await runTest(directory, "simple-assign.js");
      });

      it("Simple with Object.assign #2", async () => {
        await runTest(directory, "simple-assign2.js");
      });

      it("Simple with Object.assign #3", async () => {
        await runTest(directory, "simple-assign3.js");
      });

      it("Simple with Object.assign #4", async () => {
        await runTest(directory, "simple-assign4.js");
      });

      it("Simple with Object.assign #5", async () => {
        await runTest(directory, "simple-assign5.js");
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

      it("Delete element prop key", async () => {
        await runTest(directory, "delete-element-prop-key.js");
      });

      it("Key change with fragments", async () => {
        await runTest(directory, "key-change-fragments.js");
      });

      it("Key not changing with fragments", async () => {
        await runTest(directory, "key-not-change-fragments.js");
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

      it("Render array twice", async () => {
        await runTest(directory, "array-twice.js");
      });

      it("Render nested array children", async () => {
        await runTest(directory, "nested-array-children.js");
      });

      it("Return undefined", async () => {
        await runTest(directory, "return-undefined.js");
      });

      it("Event handlers", async () => {
        await runTest(directory, "event-handlers.js");
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

      it("Complex class components folding into functional root component", async () => {
        await runTest(directory, "complex-class-into-functional-root.js");
      });

      it("Complex class components folding into functional root component #2", async () => {
        await runTest(directory, "complex-class-into-functional-root2.js");
      });

      it("Complex class components folding into functional root component #3", async () => {
        await runTest(directory, "complex-class-into-functional-root3.js");
      });

      it("Complex class components folding into functional root component #4", async () => {
        await runTest(directory, "complex-class-into-functional-root4.js");
      });

      it("Complex class components folding into functional root component #5", async () => {
        await runTest(directory, "complex-class-into-functional-root5.js");
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

    describe("Render props", () => {
      let directory = "render-props";

      it("Relay QueryRenderer", async () => {
        await runTest(directory, "relay-query-renderer.js");
      });

      it("Relay QueryRenderer 2", async () => {
        await runTest(directory, "relay-query-renderer2.js");
      });

      it("Relay QueryRenderer 3", async () => {
        await runTest(directory, "relay-query-renderer3.js");
      });
    });

    describe("First render only", () => {
      let directory = "first-render-only";

      it("Simple", async () => {
        await runTest(directory, "simple.js", true);
      });

      it("componentWillMount", async () => {
        await runTest(directory, "will-mount.js", true);
      });
    });

    describe("fb-www mocks", () => {
      let directory = "mocks";

      it("fb-www", async () => {
        await stubReactRelay(async () => {
          await runTest(directory, "fb1.js");
        });
      });

      it("fb-www 2", async () => {
        await runTest(directory, "fb2.js");
      });

      it("fb-www 3", async () => {
        await stubReactRelay(async () => {
          await runTest(directory, "fb3.js");
        });
      });

      it("fb-www 4", async () => {
        await stubReactRelay(async () => {
          await runTest(directory, "fb4.js");
        });
      });

      it("fb-www 5", async () => {
        await runTest(directory, "fb5.js");
      });

      it("fb-www 6", async () => {
        await runTest(directory, "fb6.js");
      });

      it("fb-www 7", async () => {
        await runTest(directory, "fb7.js");
      });

      it("fb-www 8", async () => {
        await runTest(directory, "fb8.js");
      });

      it("fb-www 9", async () => {
        await runTest(directory, "fb9.js");
      });

      it("fb-www 10", async () => {
        await runTest(directory, "fb10.js");
      });

      it("fb-www 11", async () => {
        await runTest(directory, "fb11.js");
      });

      it("repl example", async () => {
        await runTest(directory, "repl-example.js");
      });

      it("Hacker News app", async () => {
        let data = JSON.parse(getDataFile(directory, "hacker-news.json"));
        await runTest(directory, "hacker-news.js", false, data);
      });
    });
  });
}

// pre non-transpiled
runTestSuite(true, false);
runTestSuite(false, false);
// pre transpiled
runTestSuite(true, true);
runTestSuite(false, true);
