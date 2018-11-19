/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

const fs = require("fs");
const setupReactTests = require("./setupReactTests");
const { runTest, stubReactRelay } = setupReactTests();

/* eslint-disable no-undef */
const { it } = global;

it("fb-www", () => {
  stubReactRelay(() => {
    runTest(__dirname + "/FBMocks/fb1.js");
  });
});

it("fb-www 2", () => {
  runTest(__dirname + "/FBMocks/fb2.js");
});

it("fb-www 3", () => {
  stubReactRelay(() => {
    runTest(__dirname + "/FBMocks/fb3.js");
  });
});

it("fb-www 4", () => {
  stubReactRelay(() => {
    runTest(__dirname + "/FBMocks/fb4.js");
  });
});

it("fb-www 5", () => {
  runTest(__dirname + "/FBMocks/fb5.js");
});

it("fb-www 6", () => {
  runTest(__dirname + "/FBMocks/fb6.js");
});

it("fb-www 7", () => {
  runTest(__dirname + "/FBMocks/fb7.js");
});

it("fb-www 8", () => {
  runTest(__dirname + "/FBMocks/fb8.js");
});

it("fb-www 9", () => {
  runTest(__dirname + "/FBMocks/fb9.js");
});

it("fb-www 10", () => {
  runTest(__dirname + "/FBMocks/fb10.js");
});

it("fb-www 11", () => {
  runTest(__dirname + "/FBMocks/fb11.js");
});

it("fb-www 12", () => {
  runTest(__dirname + "/FBMocks/fb12.js", {
    expectReconcilerError: true,
  });
});

it("fb-www 13", () => {
  runTest(__dirname + "/FBMocks/fb13.js");
});

it("fb-www 14", () => {
  runTest(__dirname + "/FBMocks/fb14.js");
});

it("fb-www 15", () => {
  runTest(__dirname + "/FBMocks/fb15.js", {
    expectReconcilerError: true,
  });
});

it("fb-www 16", () => {
  runTest(__dirname + "/FBMocks/fb16.js", {
    expectReconcilerError: true,
  });
});

it("fb-www 17", () => {
  runTest(__dirname + "/FBMocks/fb17.js");
});

// Test fails for two reasons:
// - "uri.foo" on abstract string does not exist
// - unused.bar() does not exist (even if in try/catch)
it("fb-www 18", () => {
  runTest(__dirname + "/FBMocks/fb18.js", {
    expectReconcilerError: true,
  });
});

it("fb-www 19", () => {
  runTest(__dirname + "/FBMocks/fb19.js", {
    expectReconcilerError: true,
  });
});

it("fb-www 20", () => {
  runTest(__dirname + "/FBMocks/fb20.js");
});

it("fb-www 21", () => {
  runTest(__dirname + "/FBMocks/fb21.js");
});

it("fb-www 22", () => {
  runTest(__dirname + "/FBMocks/fb22.js");
});

it("fb-www 23", () => {
  runTest(__dirname + "/FBMocks/fb23.js");
});

it("fb-www 24", () => {
  runTest(__dirname + "/FBMocks/fb24.js");
});

it("fb-www 25", () => {
  runTest(__dirname + "/FBMocks/fb25.js");
});

it("repl example", () => {
  runTest(__dirname + "/FBMocks/repl-example.js");
});

it("Hacker News app", () => {
  let data = JSON.parse(fs.readFileSync(__dirname + "/FBMocks/hacker-news.json").toString());
  runTest(__dirname + "/FBMocks/hacker-news.js", { data });
});

it("Function bind", () => {
  runTest(__dirname + "/FBMocks/function-bind.js");
});

it("PE Functional Components benchmark", () => {
  runTest(__dirname + "/FBMocks/pe-functional-benchmark.js");
});
