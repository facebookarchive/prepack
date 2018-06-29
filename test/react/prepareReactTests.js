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
let { prepackSources } = require("../../lib/prepack-node.js");
let babel = require("babel-core");
let React = require("react");
let ReactDOM = require("react-dom");
let ReactDOMServer = require("react-dom/server");
let PropTypes = require("prop-types");
let ReactRelay = require("react-relay");
let ReactTestRenderer = require("react-test-renderer");
let { mergeAdjacentJSONTextNodes } = require("../../lib/utils/json.js");

/* eslint-disable no-undef */
const { expect } = global;

// Patch console.error to reduce the noise
let originalConsoleError = global.console.error;
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
global.cx = cxShim;
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

function prepareReactTests() {
  let checkForReconcilerFatalError = false;
  let checkForPartialKeyOrRefError = false;
  let errorsCaptured = [];
  let reactTestRoot = path.join(__dirname, "../test/react/");

  function expectReconcilerFatalError(func: Function) {
    checkForReconcilerFatalError = true;
    try {
      return func();
    } catch (e) {
      expect(e.__isReconcilerFatalError).toBe(true);
      expect(e.message).toMatchSnapshot();
    } finally {
      checkForReconcilerFatalError = false;
    }
  }

  function expectPartialKeyOrRefError(func: Function) {
    checkForPartialKeyOrRefError = true;
    try {
      return func();
    } catch (e) {
      expect(e.__isReconcilerFatalError).toBe(true);
      expect(e.message).toMatchSnapshot();
    } finally {
      checkForPartialKeyOrRefError = false;
    }
  }

  function compileSourceWithPrepack(source, useJSXOutput) {
    let code = `(function(){${source}})()`;
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
      reactOutput: useJSXOutput ? "jsx" : "create-element",
      reactOptimizeNestedFunctions: true,
      inlineExpressions: true,
      invariantLevel: 0,
      stripFlow: true,
    };
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

  function stubReactRelay(f: Function) {
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
      return f();
    } finally {
      ReactRelay = oldReactRelay;
    }
  }

  function runTestWithOptions(source, firstRenderOnly, data, useJSXOutput) {
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
        expect(mergeAdjacentJSONTextNodes(valueB, firstRenderOnly)).toEqual(
          mergeAdjacentJSONTextNodes(valueA, firstRenderOnly)
        );
      }
      expect(nameB).toEqual(nameA);
    }
  }

  function runTest(fixturePath: string, firstRenderOnly?: boolean = false, data?: mixed) {
    let source = fs.readFileSync(fixturePath).toString();
    let jsxSource = transpileSource(source);
    runTestWithOptions(jsxSource, firstRenderOnly, data, false);
    runTestWithOptions(source, firstRenderOnly, data, false);
    runTestWithOptions(jsxSource, firstRenderOnly, data, true);
    runTestWithOptions(source, firstRenderOnly, data, true);
  }

  return {
    expectReconcilerFatalError,
    expectPartialKeyOrRefError,
    runTest,
    stubReactRelay,
  };
}

module.exports = prepareReactTests;