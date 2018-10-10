/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

const React = require("react");
const setupReactTests = require("./setupReactTests");
const { runTest } = setupReactTests();

/* eslint-disable no-undef */
const { expect, it } = global;

it("Key nesting", () => {
  runTest(__dirname + "/Reconciliation/key-nesting.js");
});

it("Key nesting 2", () => {
  runTest(__dirname + "/Reconciliation/key-nesting-2.js");
});

it("Key nesting 3", () => {
  runTest(__dirname + "/Reconciliation/key-nesting-3.js");
});

it("Key nesting 4", () => {
  runTest(__dirname + "/Reconciliation/key-nesting-4.js");
});

it("Key nesting 5", () => {
  runTest(__dirname + "/Reconciliation/key-nesting-5.js");
});

it("Key nesting 6", () => {
  runTest(__dirname + "/Reconciliation/key-nesting-6.js");
});

it("Key nesting 7", () => {
  runTest(__dirname + "/Reconciliation/key-nesting-7.js");
});

it("Key nesting 8", () => {
  runTest(__dirname + "/Reconciliation/key-nesting-8.js");
});

it("Key nesting 9", () => {
  runTest(__dirname + "/Reconciliation/key-nesting-9.js", {
    expectedCreateElementCalls:
      /* original 3 reactElements for 6 test cases */ 18 +
      /* prepacked: one removed by inlining, but we have 6 test cases */ 12,
  });
});

it("Key change", () => {
  runTest(__dirname + "/Reconciliation/key-change.js");
});

it("Key change with fragments", () => {
  runTest(__dirname + "/Reconciliation/key-change-fragments.js");
});

it("Key not changing with fragments", () => {
  runTest(__dirname + "/Reconciliation/key-not-change-fragments.js");
});

it("Component type change", () => {
  runTest(__dirname + "/Reconciliation/type-change.js");
});

it("Component type change 2", () => {
  runTest(__dirname + "/Reconciliation/type-change2.js");
});

it("Component type change 3", () => {
  runTest(__dirname + "/Reconciliation/type-change3.js");
});

it("Component type change 4", () => {
  runTest(__dirname + "/Reconciliation/type-change4.js");
});

it("Component type change 5", () => {
  runTest(__dirname + "/Reconciliation/type-change5.js");
});

it("Component type change 6", () => {
  runTest(__dirname + "/Reconciliation/type-change6.js");
});

it("Component type change 7", () => {
  runTest(__dirname + "/Reconciliation/type-change7.js");
});

it("Component type change 8", () => {
  runTest(__dirname + "/Reconciliation/type-change8.js");
});

it("Component type change 9", () => {
  runTest(__dirname + "/Reconciliation/type-change9.js");
});

it("Component type change 10", () => {
  runTest(__dirname + "/Reconciliation/type-change10.js");
});

it("Component type change 11", () => {
  runTest(__dirname + "/Reconciliation/type-change11.js");
});

it("Component type same", () => {
  runTest(__dirname + "/Reconciliation/type-same.js");
});

it("Lazy branched elements", () => {
  runTest(__dirname + "/Reconciliation/lazy-branched-elements.js", {
    expectedCreateElementCalls: /* original */ 4 + /* prepacked */ 4,
  });
});

it("Lazy branched elements 2", () => {
  runTest(__dirname + "/Reconciliation/lazy-branched-elements2.js", {
    expectedCreateElementCalls: /* original */ 4 + /* prepacked: one removed by inlining */ 3,
  });
});
