/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

const setupReactTests = require("./setupReactTests");
const { runTest } = setupReactTests();

/* eslint-disable no-undef */
const { it } = global;

it("Relay QueryRenderer", () => {
  runTest(__dirname + "/RenderProps/relay-query-renderer.js");
});

it("Relay QueryRenderer 2", () => {
  runTest(__dirname + "/RenderProps/relay-query-renderer2.js");
});

it("Relay QueryRenderer 3", () => {
  runTest(__dirname + "/RenderProps/relay-query-renderer3.js");
});

it("React Context", () => {
  runTest(__dirname + "/RenderProps/react-context.js");
});

it("React Context 2", () => {
  runTest(__dirname + "/RenderProps/react-context2.js");
});

it("React Context 3", () => {
  runTest(__dirname + "/RenderProps/react-context3.js");
});

it("React Context 4", () => {
  runTest(__dirname + "/RenderProps/react-context4.js");
});

it("React Context 5", () => {
  runTest(__dirname + "/RenderProps/react-context5.js");
});

it("React Context 6", () => {
  runTest(__dirname + "/RenderProps/react-context6.js");
});

it("React Context 7", () => {
  runTest(__dirname + "/RenderProps/react-context7.js");
});

it("React Context from root tree", () => {
  runTest(__dirname + "/RenderProps/react-root-context.js");
});

it("React Context from root tree 2", () => {
  runTest(__dirname + "/RenderProps/react-root-context2.js");
});

it("React Context from root tree 3", () => {
  runTest(__dirname + "/RenderProps/react-root-context3.js");
});

it("React Context from root tree 4", () => {
  runTest(__dirname + "/RenderProps/react-root-context4.js");
});
