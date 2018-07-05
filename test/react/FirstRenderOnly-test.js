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

it("Simple", () => {
  runTest(__dirname + "/FirstRenderOnly/simple.js", { firstRenderOnly: true });
});

it("Simple #2", () => {
  runTest(__dirname + "/FirstRenderOnly/simple-2.js", { firstRenderOnly: true });
});

it("Simple #3", () => {
  runTest(__dirname + "/FirstRenderOnly/simple-3.js", { firstRenderOnly: true });
});

// Should be refined in a follow up PR to check for
// functions and keys on deep referenced objects linking
// to host components
it("Simple #4", () => {
  runTest(__dirname + "/FirstRenderOnly/simple-4.js", { firstRenderOnly: true });
});

it("componentWillMount", () => {
  runTest(__dirname + "/FirstRenderOnly/will-mount.js", { firstRenderOnly: true });
});

it("getDerivedStateFromProps", () => {
  runTest(__dirname + "/FirstRenderOnly/get-derived-state-from-props.js", { firstRenderOnly: true });
});

it("getDerivedStateFromProps 2", () => {
  runTest(__dirname + "/FirstRenderOnly/get-derived-state-from-props2.js", { firstRenderOnly: true });
});

it("getDerivedStateFromProps 3", () => {
  runTest(__dirname + "/FirstRenderOnly/get-derived-state-from-props3.js", { firstRenderOnly: true });
});

it("getDerivedStateFromProps 4", () => {
  runTest(__dirname + "/FirstRenderOnly/get-derived-state-from-props4.js", { firstRenderOnly: true });
});

it("getDerivedStateFromProps 5", () => {
  runTest(__dirname + "/FirstRenderOnly/get-derived-state-from-props5.js", { firstRenderOnly: true });
});

it("React Context", () => {
  runTest(__dirname + "/FirstRenderOnly/react-context.js", { firstRenderOnly: true });
});

it("React Context 2", () => {
  runTest(__dirname + "/FirstRenderOnly/react-context2.js", { firstRenderOnly: true });
});

it("React Context 3", () => {
  runTest(__dirname + "/FirstRenderOnly/react-context3.js", { firstRenderOnly: true });
});

it("React Context 4", () => {
  runTest(__dirname + "/FirstRenderOnly/react-context4.js", { firstRenderOnly: true });
});

it("React Context 5", () => {
  runTest(__dirname + "/FirstRenderOnly/react-context5.js", { firstRenderOnly: true });
});

it("React Context 6", () => {
  runTest(__dirname + "/FirstRenderOnly/react-context6.js", { firstRenderOnly: true });
});

// Known to be broken due to incomplete arrow function support.
it.skip("Replace this in callbacks", () => {
  runTest(__dirname + "/FirstRenderOnly/replace-this-in-callbacks.js", { firstRenderOnly: true });
});

it("Replace this in callbacks 2", () => {
  runTest(__dirname + "/FirstRenderOnly/replace-this-in-callbacks2.js", { firstRenderOnly: true });
});

it("Replace this in callbacks 3", () => {
  runTest(__dirname + "/FirstRenderOnly/replace-this-in-callbacks3.js", { firstRenderOnly: true });
});

it("Equivalence of snapshotted node", () => {
  runTest(__dirname + "/FirstRenderOnly/equivalence.js", { firstRenderOnly: true });
});

it("Equivalence of snapshotted node 2", () => {
  runTest(__dirname + "/FirstRenderOnly/equivalence2.js", { firstRenderOnly: true });
});

it("Equivalence of snapshotted node 3", () => {
  runTest(__dirname + "/FirstRenderOnly/equivalence3.js", { firstRenderOnly: true });
});

it("Equivalence of snapshotted node 4", () => {
  runTest(__dirname + "/FirstRenderOnly/equivalence4.js", { firstRenderOnly: true });
});

it("Equivalence of snapshotted node 5", () => {
  runTest(__dirname + "/FirstRenderOnly/equivalence5.js", { firstRenderOnly: true });
});
