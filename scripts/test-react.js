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
let { ObjectCreate, CreateDataPropertyOrThrow, GetValue } = require("../lib/methods/index.js");
let buildExpressionTemplate = require("../lib/utils/builder.js").default;
let babel = require("babel-core");
let React = require("react");
let t = require("babel-types");
let ReactTestRenderer = require("react-test-renderer");
let { Value, AbstractValue, NativeFunctionValue, ObjectValue } = require("../lib/values/index.js");
let { normalize } = require("../lib/utils/json.js");
/* eslint-disable no-undef */
let { expect, describe, it } = global;

let reactTestRoot = path.join(__dirname, "../test/react/");
let prepackOptions = {
  errorHandler: diag => "Fail",
  internalDebug: true,
  serialize: true,
  uniqueSuffix: "",
  maxStackDepth: 100,
  reactEnabled: true,
  additionalGlobals,
  inlineExpressions: true,
  omitInvariants: true,
};

// this a mock of React.Component, to be used for tests
function createMockReactComponent() {
  return t.classExpression(
    null,
    null,
    t.classBody([
      t.classMethod(
        "constructor",
        t.identifier("constructor"),
        [t.identifier("props"), t.identifier("context")],
        t.blockStatement([
          // this.props = props
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.thisExpression(), t.identifier("props")),
              t.identifier("props")
            )
          ),
          // this.context = context
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.thisExpression(), t.identifier("context")),
              t.identifier("context")
            )
          ),
          // this.state = {}
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.thisExpression(), t.identifier("state")),
              t.objectExpression([])
            )
          ),
          // this.ref = {}
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.thisExpression(), t.identifier("refs")),
              t.objectExpression([])
            )
          ),
        ])
      ),
      t.classMethod("method", t.identifier("getChildContext"), [], t.blockStatement([])),
    ]),
    []
  );
}

function additionalGlobals(realm) {
  let global = realm.$GlobalObject;
  // module.exports support
  let exportsValue = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  exportsValue.intrinsicName = "exports";
  let moduleValue = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  moduleValue.intrinsicName = "module";
  moduleValue.$Set("exports", exportsValue, moduleValue);

  global.$DefineOwnProperty("module", {
    value: moduleValue,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  // require("SomeModule") support (makes them abstract)
  let type = Value.getTypeFromName("function");
  let requireValue = AbstractValue.createFromTemplate(
    realm,
    buildExpressionTemplate("require"),
    (type: any), // Flow complains that type of Value isn't compatible with class Value :/
    [],
    "require"
  );
  requireValue.intrinsicName = "require";
  global.$DefineOwnProperty("require", {
    value: requireValue,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  // apply React mock (for now just React.Component)
  global.$DefineOwnProperty("__createReactMock", {
    value: new NativeFunctionValue(realm, "global.__createReactMock", "__createReactMock", 0, (context, []) => {
      let reactComponent = GetValue(realm, realm.$GlobalEnv.evaluate(createMockReactComponent(), false));
      reactComponent.intrinsicName = "React.Component";
      let prototypeValue = ((reactComponent: any): ObjectValue).properties.get("prototype");
      if (prototypeValue && prototypeValue.descriptor) {
        ((prototypeValue.descriptor.value: any): Value).intrinsicName = `React.Component.prototype`;
      }
      let reactValue = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
      reactValue.intrinsicName = "React";
      CreateDataPropertyOrThrow(realm, reactValue, "Component", reactComponent);
      return reactValue;
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

function compileSourceWithPrepack(source) {
  let code = `(function(){${source}})()`;
  let serialized = prepackSources([{ filePath: "", fileContents: code, sourceMapContents: "" }], prepackOptions);
  // add the React require back in, as we've removed it with our Prepack mock
  let compiledSource = serialized.code.replace(/_\$[\d].React/, "React = require('react')");
  if (serialized == null || serialized.reactStatistics == null) {
    throw new Error("React test runner failed during serialization");
  }
  return {
    // replace the code to put back the generator (Prepack doesn't serialize them yet)
    compiledSource,
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
  if (Array.isArray(resultA) && Array.isArray(resultA[0])) {
    for (let i = 0; i < resultA.length; i++) {
      let [nameA, valueA] = resultA[i];
      let [nameB, valueB] = resultB[i];
      expect(normalize(valueB)).toEqual(normalize(valueA));
      expect(nameB).toEqual(nameA);
    }
  } else {
    let [nameA, valueA] = resultA;
    let [nameB, valueB] = resultB;
    expect(normalize(valueB)).toEqual(normalize(valueA));
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

    it("Key nesting with updates", async () => {
      await runTest(directory, "key-nesting-updates.js");
    });

    it("Dynamic props", async () => {
      await runTest(directory, "dynamic-props.js");
    });

    it("Dynamic context", async () => {
      await runTest(directory, "dynamic-context.js");
    });

    it("Return text", async () => {
      await runTest(directory, "return-text.js");
    });

    it("Return undefined", async () => {
      // this test will cause a React console.error to show
      // we monkey patch it to stop it polluting the test output
      // with a false-negative error
      global.console.error = () => {};
      await runTest(directory, "return-undefined.js");
      global.console.error = originalConsoleError;
    });
  });
});
