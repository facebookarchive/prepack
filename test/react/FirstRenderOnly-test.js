/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

const prepareReactTests = require("./prepareReactTests");
const { runTest } = prepareReactTests();

/* eslint-disable no-undef */
const { it } = global;

it("Simple", async () => {
  await runTest(__dirname + "/FirstRenderOnly/simple.js", true);
});

it("Simple #2", async () => {
  await runTest(__dirname + "/FirstRenderOnly/simple-2.js", true);
});

it("Simple #3", async () => {
  await runTest(__dirname + "/FirstRenderOnly/simple-3.js", true);
});

// Should be refined in a follow up PR to check for
// functions and keys on deep referenced objects linking
// to host components
it("Simple #4", async () => {
  await runTest(__dirname + "/FirstRenderOnly/simple-4.js", true);
});

it("componentWillMount", async () => {
  await runTest(__dirname + "/FirstRenderOnly/will-mount.js", true);
});

it("getDerivedStateFromProps", async () => {
  await runTest(__dirname + "/FirstRenderOnly/get-derived-state-from-props.js", true);
});

it("getDerivedStateFromProps 2", async () => {
  await runTest(__dirname + "/FirstRenderOnly/get-derived-state-from-props2.js", true);
});

it("getDerivedStateFromProps 3", async () => {
  await runTest(__dirname + "/FirstRenderOnly/get-derived-state-from-props3.js", true);
});

it("getDerivedStateFromProps 4", async () => {
  await runTest(__dirname + "/FirstRenderOnly/get-derived-state-from-props4.js", true);
});

it("getDerivedStateFromProps 5", async () => {
  await runTest(__dirname + "/FirstRenderOnly/get-derived-state-from-props5.js", true);
});

it("React Context", async () => {
  await runTest(__dirname + "/FirstRenderOnly/react-context.js");
});

it("React Context 2", async () => {
  await runTest(__dirname + "/FirstRenderOnly/react-context2.js");
});

it("React Context 3", async () => {
  await runTest(__dirname + "/FirstRenderOnly/react-context3.js");
});

it("React Context 4", async () => {
  await runTest(__dirname + "/FirstRenderOnly/react-context4.js");
});

it("React Context 5", async () => {
  await runTest(__dirname + "/FirstRenderOnly/react-context5.js");
});

it("React Context 6", async () => {
  await runTest(__dirname + "/FirstRenderOnly/react-context6.js");
});

it.skip("Replace this in callbacks", async () => {
  await runTest(__dirname + "/FirstRenderOnly/replace-this-in-callbacks.js");
});

it("Replace this in callbacks 2", async () => {
  await runTest(__dirname + "/FirstRenderOnly/replace-this-in-callbacks2.js");
});

it("Replace this in callbacks 3", async () => {
  await runTest(__dirname + "/FirstRenderOnly/replace-this-in-callbacks3.js");
});
