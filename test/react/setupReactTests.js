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
let ReactNative = require("react-native");
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

const babelHelpers = {
  inherits(subClass, superClass) {
    Object.assign(subClass, superClass);
    subClass.prototype = Object.create(superClass && superClass.prototype);
    subClass.prototype.constructor = subClass;
    subClass.__superConstructor__ = superClass;
    return superClass;
  },
  _extends: Object.assign,
  extends: Object.assign,
  objectWithoutProperties(obj, keys) {
    var target = {};
    var hasOwn = Object.prototype.hasOwnProperty;
    for (var i in obj) {
      if (!hasOwn.call(obj, i) || keys.indexOf(i) >= 0) {
        continue;
      }
      target[i] = obj[i];
    }
    return target;
  },
  taggedTemplateLiteralLoose(strings, raw) {
    strings.raw = raw;
    return strings;
  },
  bind: Function.prototype.bind,
};

function setupReactTests() {
  function compileSourceWithPrepack(
    source: string,
    useJSXOutput: boolean,
    diagnosticLog: mixed[],
    shouldRecover: (errorCode: string) => boolean
  ): {|
    compiledSource: string,
    statistics: Object,
  |} {
    let code = `(function() {
${source}
})()`;
    let prepackOptions = {
      errorHandler: diag => {
        diagnosticLog.push(diag);
        if (diag.severity !== "Warning" && diag.severity !== "Information") {
          if (shouldRecover(diag.errorCode)) {
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
      arrayNestedOptimizedFunctionsEnabled: true,
      inlineExpressions: true,
      invariantLevel: 0,
      stripFlow: true,
    };
    const serialized = prepackSources([{ filePath: "", fileContents: code, sourceMapContents: "" }], prepackOptions);
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
      configFile: false,
      presets: ["@babel/preset-flow"],
      plugins: [
        ["@babel/plugin-proposal-object-rest-spread", { loose: true, useBuiltIns: true }],
        ["@babel/plugin-transform-react-jsx", { useBuiltIns: true }],
      ],
    }).code;
  }

  function runSource(source) {
    let transformedSource = `
      // Add global variable for spec compliance.
      let global = this;
      // Inject React since compiled JSX would reference it.
      let React = require('react');
      (function() {
        ${transpileSource(source)}
      })();
    `;
    /* eslint-disable no-new-func */
    let fn = new Function("require", "module", "babelHelpers", transformedSource);
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
        case "ReactNative":
        case "react-native":
          return ReactNative;
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
      fn(requireShim, moduleShim, babelHelpers);
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

  function runTestWithOptions(source, useJSXOutput, options, snapshotName) {
    let {
      firstRenderOnly = false,
      // By default, we recover from PP0025 even though it's technically unsafe.
      // We do the same in debug-fb-www script.
      shouldRecover = errorCode => errorCode === "PP0025",
      expectReconcilerError = false,
      expectRuntimeError = false,
      expectedCreateElementCalls,
      data,
    } = options;

    let diagnosticLog = [];
    let compiledSource, statistics;
    try {
      ({ compiledSource, statistics } = compileSourceWithPrepack(source, useJSXOutput, diagnosticLog, shouldRecover));
    } catch (err) {
      if (err.__isReconcilerFatalError && expectReconcilerError) {
        expect(err.message).toMatchSnapshot(snapshotName);
        return;
      }
      diagnosticLog.forEach(diag => {
        console.error(diag);
      });
      throw err;
    }

    let totalElementCount = 0;
    let originalCreateElement = React.createElement;
    // $FlowFixMe: intentional for this test
    React.createElement = (...args) => {
      totalElementCount++;
      return originalCreateElement(...args);
    };
    try {
      expect(statistics).toMatchSnapshot(snapshotName);
      let A = runSource(source);
      let B = runSource(compiledSource);

      expect(typeof A).toBe(typeof B);
      if (A == null || B == null) {
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

      // Use the original version of the test in case transforming messes it up.
      let { getTrials: getTrialsA, independent } = A;
      let { getTrials: getTrialsB } = B;
      // Run tests that assert the rendered output matches.
      let resultA;
      let resultB;
      try {
        resultA = getTrialsA(rendererA, A, data, false);
        resultB = independent ? getTrialsB(rendererB, B, data, true) : getTrialsA(rendererB, B, data, false);
      } catch (err) {
        if (expectRuntimeError) {
          expect(err.message).toMatchSnapshot(snapshotName);
          return;
        }
        throw err;
      }

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
    } finally {
      // $FlowFixMe: intentional for this test
      React.createElement = originalCreateElement;
    }

    if (typeof expectedCreateElementCalls === "number") {
      // TODO: it would be nice to check original and prepacked ones separately.
      expect(totalElementCount).toBe(expectedCreateElementCalls);
    }
  }

  type TestOptions = {
    firstRenderOnly?: boolean,
    data?: mixed,
    expectReconcilerError?: boolean,
    expectRuntimeError?: boolean,
    expectedCreateElementCalls?: number,
    shouldRecover?: (errorCode: string) => boolean,
  };

  function runTest(fixturePath: string, options: TestOptions = {}) {
    let source = fs.readFileSync(fixturePath).toString();
    // Run tests that don't need the transform first so they can fail early.
    runTestWithOptions(source, false, options, "(createElement => createElement)");

    if (process.env.SKIP_REACT_JSX_TESTS !== "true") {
      runTestWithOptions(source, true, options, "(createElement => JSX)");
      let jsxSource = transpileSource(source);
      runTestWithOptions(jsxSource, false, options, "(JSX => createElement)");
      runTestWithOptions(jsxSource, true, options, "(JSX => JSX)");
    }
  }

  return {
    runTest,
    stubReactRelay,
  };
}

module.exports = setupReactTests;
