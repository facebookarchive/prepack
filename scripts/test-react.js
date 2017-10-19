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
let prepackSources = require("../lib/prepack-node.js").prepackSources;
let ObjectCreate = require("../lib/methods/index.js").ObjectCreate;
let buildExpressionTemplate = require("../lib/utils/builder.js").default;
let babel = require("babel-core");
let React = require("react");
let ReactTestRenderer = require("react-test-renderer");
let { Value, AbstractValue } = require("../lib/values/index.js");

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

// this will mutate the original JSON object
function normalize(node) {
  // we merge adjacent text nodes
  if (Array.isArray(node)) {
    // we create a new array rather than mutating the original
    let arr = [];
    let length = node.length;
    let concatString = null;
    let i = -1;
    while (i++ < length) {
      let child = node[i];
      if (typeof child === "string" || typeof child === "number") {
        if (concatString !== null) {
          concatString += child;
        } else {
          concatString = child;
        }
      } else if (typeof child === "object" && child !== null) {
        if (concatString !== null) {
          arr.push(concatString);
          concatString = null;
        }
        arr.push(normalize(child));
      }
    }
    if (concatString !== null) {
      arr.push(concatString);
    }
    return arr;
  } else {
    for (let key in node) {
      let value = node[key];
      if (typeof value === "object" && value !== null) {
        node[key] = normalize(value);
      }
    }
  }
  return node;
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
}

function compileSourceWithPrepack(source) {
  let code = `(function(){${source}})()`;
  let serialized = prepackSources([{ filePath: "", fileContents: code, sourceMapContents: "" }], prepackOptions);
  // we need to make this change for the Babel createElement plugin to work
  let compiledSource = serialized.code.replace(`var _$0 = require("react");`, `var React = require("react");`);
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
  };
  fn.call(global, requireShim, moduleShim);
  return moduleShim.exports;
}

async function runTest(name) {
  let source = fs.readFileSync(path.join(reactTestRoot, name)).toString();
  let { compiledSource, statistics } = compileSourceWithPrepack(source);
  
  let A = runSource(source);
  expect(typeof A).toBe("function");
  let B = runSource(compiledSource);
  expect(typeof B).toBe("function");

  let rendererA = ReactTestRenderer.create(null);
  let rendererB = ReactTestRenderer.create(null);

  // Use the original version of the test in case transforming messes it up.
  let { getTrials } = A;
  
  // Run tests that assert the rendered output matches.
  let [nameA, valueA] = getTrials(rendererA, A);
  let [nameB, valueB] = getTrials(rendererB, B);

  expect(normalize(valueB)).toEqual(normalize(valueA));
  expect(nameB).toEqual(nameA);
}

describe("Test React", () => {
  describe("Functional component folding", () => {
    it("Simple", async () => {
      await runTest("simple.js");
    });
  });
});
