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
let ReactDOM = require("react-dom");
let ReactDOMServer = require("react-dom/server");
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

function MockURI(url) {
  this.url = url;
}

MockURI.prototype.addQueryData = function() {
  this.url += "&queryData";
  return this;
};

MockURI.prototype.makeString = function() {
  return this.url;
};

function runTestSuite(outputJsx, shouldTranspileSource) {
  let checkForReconcilerFatalError = false;
  let checkForPartialKeyOrRefError = false;
  let errorsCaptured = [];
  let reactTestRoot = path.join(__dirname, "../test/react/");
  let prepackOptions = {
    errorHandler: diag => {
      errorsCaptured.push(diag);
      if (diag.severity !== "Warning" && diag.severity !== "Information") {
        if (diag.errorCode === "PP0025" && !checkForPartialKeyOrRefError) {
          // recover from `unable to evaluate "key" and "ref" on a ReactElement
          return "Recover";
        }
        return "Fail";
      }
      return "Recover";
    },
    compatibility: "fb-www",
    internalDebug: true,
    serialize: true,
    uniqueSuffix: "",
    maxStackDepth: 100,
    reactEnabled: true,
    reactOutput: outputJsx ? "jsx" : "create-element",
    reactOptimizeNestedFunctions: true,
    inlineExpressions: true,
    invariantLevel: 0,
    stripFlow: true,
  };

  async function expectReconcilerFatalError(func) {
    checkForReconcilerFatalError = true;
    try {
      await func();
    } catch (e) {
      expect(e.__isReconcilerFatalError).toBe(true);
      expect(e.message).toMatchSnapshot();
    } finally {
      checkForReconcilerFatalError = false;
    }
  }

  async function expectPartialKeyOrRefError(func) {
    checkForPartialKeyOrRefError = true;
    try {
      await func();
    } catch (e) {
      expect(e.__isReconcilerFatalError).toBe(true);
      expect(e.message).toMatchSnapshot();
    } finally {
      checkForPartialKeyOrRefError = false;
    }
  }

  function compileSourceWithPrepack(source) {
    let code = `(function(){${source}})()`;
    let serialized;
    errorsCaptured = [];
    try {
      serialized = prepackSources([{ filePath: "", fileContents: code, sourceMapContents: "" }], prepackOptions);
    } catch (e) {
      if (e.__isReconcilerFatalError && (checkForReconcilerFatalError || checkForPartialKeyOrRefError)) {
        throw e;
      }
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
        case "react-dom":
        case "ReactDOM":
          return ReactDOM;
        case "react-dom/server":
        case "ReactDOMServer":
          return ReactDOMServer;
        case "PropTypes":
        case "prop-types":
          return PropTypes;
        case "RelayModern":
          return ReactRelay;
        case "cx":
          return cxShim;
        case "FBEnvironment":
          return {};
        case "URI":
          return MockURI;
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

    let config = {
      createNodeMock(x) {
        return x;
      },
    };
    let rendererA = ReactTestRenderer.create(null, config);
    let rendererB = ReactTestRenderer.create(null, config);
    if (A == null || B == null) {
      throw new Error("React test runner issue");
    }
    // Use the original version of the test in case transforming messes it up.
    let { getTrials: getTrialsA, independent } = A;
    let { getTrials: getTrialsB } = B;
    // Run tests that assert the rendered output matches.
    let resultA = getTrialsA(rendererA, A, data);
    let resultB = independent ? getTrialsB(rendererB, B, data) : getTrialsA(rendererB, B, data);

    // The test has returned many values for us to check
    for (let i = 0; i < resultA.length; i++) {
      let [nameA, valueA] = resultA[i];
      let [nameB, valueB] = resultB[i];
      if (typeof valueA === "string" && typeof valueB === "string") {
        expect(valueA).toBe(valueB);
      } else {
        expect(mergeAdacentJSONTextNodes(valueB, firstRenderOnly)).toEqual(
          mergeAdacentJSONTextNodes(valueA, firstRenderOnly)
        );
      }
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

  describe(`Test React with ${shouldTranspileSource ? "create-element input" : "JSX input"}, ${
    outputJsx ? "JSX output" : "create-element output"
  }`, () => {
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

      it("Simple 8", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "simple-8.js");
        });
      });

      it("Simple 9", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "simple-9.js");
        });
      });

      it("Simple 10", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "simple-10.js");
        });
      });

      it("Simple 11", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "simple-11.js");
        });
      });

      it("Simple 12", async () => {
        await runTest(directory, "simple-12.js");
      });

      // this should intentionally fail
      it("Runtime error", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "runtime-error.js");
        });
      });

      it("Simple 13", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "simple-13.js");
        });
      });

      it("Simple 14", async () => {
        await runTest(directory, "simple-14.js");
      });

      it("Simple 15", async () => {
        await runTest(directory, "simple-15.js");
      });

      it("Simple 16", async () => {
        await runTest(directory, "simple-16.js");
      });

      it("Simple 17", async () => {
        await runTest(directory, "simple-17.js");
      });

      it("Havocing of ReactElements should not result in property assignments", async () => {
        await runTest(directory, "react-element-havoc.js");
      });

      it("__reactCompilerDoNotOptimize", async () => {
        await runTest(directory, "do-not-optimize.js");
      });

      it("Mutations - not-safe 1", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "not-safe.js");
        });
      });

      it("Mutations - not-safe 2", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "not-safe2.js");
        });
      });

      it("Mutations - safe 1", async () => {
        await runTest(directory, "safe.js");
      });

      it("Mutations - safe 2", async () => {
        await runTest(directory, "safe2.js");
      });

      it("Handle mapped arrays", async () => {
        await runTest(directory, "array-map.js");
      });

      it("Handle mapped arrays 2", async () => {
        await runTest(directory, "array-map2.js");
      });

      it("Simple fragments", async () => {
        await runTest(directory, "simple-fragments.js");
      });

      it("Simple children", async () => {
        await runTest(directory, "simple-children.js");
      });

      it("Simple with new expression", async () => {
        await runTest(directory, "simple-with-new-expression.js");
      });

      it("Simple refs", async () => {
        await runTest(directory, "simple-refs.js");
      });

      it("16.3 refs", async () => {
        await runTest(directory, "refs.js");
      });

      it("16.3 refs 2", async () => {
        await runTest(directory, "refs2.js");
      });

      it("16.3 refs 3", async () => {
        await runTest(directory, "refs3.js");
      });

      it("defaultProps", async () => {
        await runTest(directory, "default-props.js");
      });

      it("Unsafe spread", async () => {
        await expectPartialKeyOrRefError(async () => {
          await runTest(directory, "unsafe-spread.js");
        });
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

      it("Simple with multiple JSX spreads #7", async () => {
        await runTest(directory, "simple-with-jsx-spread7.js");
      });

      it("Simple with multiple JSX spreads #8", async () => {
        await runTest(directory, "simple-with-jsx-spread8.js");
      });

      it("Simple with multiple JSX spreads #9", async () => {
        await runTest(directory, "simple-with-jsx-spread9.js");
      });

      it("Simple with multiple JSX spreads #10", async () => {
        await runTest(directory, "simple-with-jsx-spread10.js");
      });

      it("Simple with multiple JSX spreads #11", async () => {
        await runTest(directory, "simple-with-jsx-spread11.js");
      });

      it("Simple with multiple JSX spreads #12", async () => {
        await runTest(directory, "simple-with-jsx-spread12.js");
      });

      it("Simple with multiple JSX spreads #13", async () => {
        await runTest(directory, "simple-with-jsx-spread13.js");
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

      it("Component type change 2", async () => {
        await runTest(directory, "type-change2.js");
      });

      it("Component type change 3", async () => {
        await runTest(directory, "type-change3.js");
      });

      it("Component type change 4", async () => {
        await runTest(directory, "type-change4.js");
      });

      it("Component type change 5", async () => {
        await runTest(directory, "type-change5.js");
      });

      it("Component type change 6", async () => {
        await runTest(directory, "type-change6.js");
      });

      it("Component type change 7", async () => {
        await runTest(directory, "type-change7.js");
      });

      it("Component type change 8", async () => {
        await runTest(directory, "type-change8.js");
      });

      it("Component type change 9", async () => {
        await runTest(directory, "type-change9.js");
      });

      it("Component type change 10", async () => {
        await runTest(directory, "type-change10.js");
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

      it("Null or undefined props", async () => {
        await runTest(directory, "null-or-undefined-props.js");
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

      it("Dynamic ReactElement type", async () => {
        await runTest(directory, "dynamic-type.js");
      });

      it("Dynamic ReactElement type #2", async () => {
        await runTest(directory, "dynamic-type2.js");
      });

      it("Dynamic ReactElement type #3", async () => {
        await runTest(directory, "dynamic-type3.js");
      });

      it("Lazy branched elements", async () => {
        let createElement = React.createElement;
        let count = 0;
        // $FlowFixMe: intentional for this test
        React.createElement = (type, config) => {
          count++;
          return createElement(type, config);
        };
        try {
          await runTest(directory, "lazy-branched-elements.js");
        } finally {
          // $FlowFixMe: intentional for this test
          React.createElement = createElement;
        }
        expect(count).toEqual(8);
      });

      it.only("Lazy branched elements 2", async () => {
        let createElement = React.createElement;
        let count = 0;
        // $FlowFixMe: intentional for this test
        React.createElement = (type, config) => {
          count++;
          return createElement(type, config);
        };
        try {
          await runTest(directory, "lazy-branched-elements2.js");
        } finally {
          // $FlowFixMe: intentional for this test
          React.createElement = createElement;
        }
        expect(count).toEqual(7);
      });
    });

    describe("Class component folding", () => {
      let directory = "class-components";

      it("Simple", async () => {
        await runTest(directory, "simple.js");
      });

      it("Simple classes", async () => {
        await runTest(directory, "simple-classes.js");
      });

      it("Simple classes #2", async () => {
        await runTest(directory, "simple-classes-2.js");
      });

      it("Simple classes #3", async () => {
        await runTest(directory, "simple-classes-3.js");
      });

      // awaiting PR on nested additional support #1626,
      // issues is that both the parent and child additional
      // function share the same variable, so the serializer
      // incorrectly emits it in the MainGenerator scope
      it.skip("Simple classes with Array.from", async () => {
        await runTest(directory, "array-from.js");
      });

      // same issue as last test
      it.skip("Simple classes with Array.from 2", async () => {
        await runTest(directory, "array-from2.js");
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

      it("React Context", async () => {
        await runTest(directory, "react-context.js");
      });

      it("React Context 2", async () => {
        await runTest(directory, "react-context2.js");
      });

      it("React Context 3", async () => {
        await runTest(directory, "react-context3.js");
      });

      it("React Context 4", async () => {
        await runTest(directory, "react-context4.js");
      });

      it("React Context 5", async () => {
        await runTest(directory, "react-context5.js");
      });

      it("React Context 6", async () => {
        await runTest(directory, "react-context6.js");
      });

      it("React Context 7", async () => {
        await runTest(directory, "react-context7.js");
      });

      it("React Context from root tree", async () => {
        await runTest(directory, "react-root-context.js");
      });

      it("React Context from root tree 2", async () => {
        await runTest(directory, "react-root-context2.js");
      });

      it("React Context from root tree 3", async () => {
        await runTest(directory, "react-root-context3.js");
      });

      it("React Context from root tree 4", async () => {
        await runTest(directory, "react-root-context4.js");
      });
    });

    describe("First render only", () => {
      let directory = "first-render-only";

      it("Simple", async () => {
        await runTest(directory, "simple.js", true);
      });

      it("Simple #2", async () => {
        await runTest(directory, "simple-2.js", true);
      });

      it("componentWillMount", async () => {
        await runTest(directory, "will-mount.js", true);
      });

      it("getDerivedStateFromProps", async () => {
        await runTest(directory, "get-derived-state-from-props.js", true);
      });

      it("getDerivedStateFromProps 2", async () => {
        await runTest(directory, "get-derived-state-from-props2.js", true);
      });

      it("getDerivedStateFromProps 3", async () => {
        await runTest(directory, "get-derived-state-from-props3.js", true);
      });

      it("getDerivedStateFromProps 4", async () => {
        await runTest(directory, "get-derived-state-from-props4.js", true);
      });

      it("getDerivedStateFromProps 5", async () => {
        await runTest(directory, "get-derived-state-from-props5.js", true);
      });

      it("React Context", async () => {
        await runTest(directory, "react-context.js");
      });

      it("React Context 2", async () => {
        await runTest(directory, "react-context2.js");
      });

      it("React Context 3", async () => {
        await runTest(directory, "react-context3.js");
      });

      it("React Context 4", async () => {
        await runTest(directory, "react-context4.js");
      });

      it("React Context 5", async () => {
        await runTest(directory, "react-context5.js");
      });

      it("React Context 6", async () => {
        await runTest(directory, "react-context6.js");
      });

      it.skip("Replace this in callbacks", async () => {
        await runTest(directory, "replace-this-in-callbacks.js");
      });

      it("Replace this in callbacks 2", async () => {
        await runTest(directory, "replace-this-in-callbacks2.js");
      });

      it("Replace this in callbacks 3", async () => {
        await runTest(directory, "replace-this-in-callbacks3.js");
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

      it("fb-www 12", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "fb12.js");
        });
      });

      it("fb-www 13", async () => {
        await runTest(directory, "fb13.js");
      });

      it("fb-www 14", async () => {
        await runTest(directory, "fb14.js");
      });

      it("fb-www 15", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "fb15.js");
        });
      });

      it("fb-www 16", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "fb16.js");
        });
      });

      it("fb-www 17", async () => {
        await runTest(directory, "fb17.js");
      });

      // Test fails for two reasons:
      // - "uri.foo" on abstract string does not exist
      // - unused.bar() does not exist (even if in try/catch)
      it("fb-www 18", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "fb18.js");
        });
      });

      it("fb-www 19", async () => {
        await expectReconcilerFatalError(async () => {
          await runTest(directory, "fb19.js");
        });
      });

      it("fb-www 20", async () => {
        await runTest(directory, "fb20.js");
      });

      it("fb-www 21", async () => {
        await runTest(directory, "fb21.js");
      });

      it("fb-www 22", async () => {
        await runTest(directory, "fb22.js");
      });

      it("fb-www 23", async () => {
        await runTest(directory, "fb23.js");
      });

      it("repl example", async () => {
        await runTest(directory, "repl-example.js");
      });

      it("Hacker News app", async () => {
        let data = JSON.parse(getDataFile(directory, "hacker-news.json"));
        await runTest(directory, "hacker-news.js", false, data);
      });

      it("Function bind", async () => {
        await runTest(directory, "function-bind.js");
      });
    });

    describe("react-dom server rendering", () => {
      let directory = "server-rendering";

      it("Hacker News app", async () => {
        let data = JSON.parse(getDataFile(directory, "hacker-news.json"));
        await runTest(directory, "hacker-news.js", false, data);
      });
    });

    describe("react-dom", () => {
      let directory = "react-dom";

      it("createPortal", async () => {
        await runTest(directory, "create-portal.js", false);
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
