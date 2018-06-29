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
const prepareReactTests = require("./prepareReactTests");
const { runTest, expectReconcilerFatalError, expectPartialKeyOrRefError } = prepareReactTests();

/* eslint-disable no-undef */
const { expect, it } = global;

it("Key nesting", async () => {
  await runTest(__dirname + "/Reconciliation/key-nesting.js");
});

it("Key nesting 2", async () => {
  await runTest(__dirname + "/Reconciliation/key-nesting-2.js");
});

it("Key nesting 3", async () => {
  await runTest(__dirname + "/Reconciliation/key-nesting-3.js");
});

it("Key change", async () => {
  await runTest(__dirname + "/Reconciliation/key-change.js");
});

it("Key change with fragments", async () => {
  await runTest(__dirname + "/Reconciliation/key-change-fragments.js");
});

it("Key not changing with fragments", async () => {
  await runTest(__dirname + "/Reconciliation/key-not-change-fragments.js");
});

it("Component type change", async () => {
  await runTest(__dirname + "/Reconciliation/type-change.js");
});

it("Component type change 2", async () => {
  await runTest(__dirname + "/Reconciliation/type-change2.js");
});

it("Component type change 3", async () => {
  await runTest(__dirname + "/Reconciliation/type-change3.js");
});

it("Component type change 4", async () => {
  await runTest(__dirname + "/Reconciliation/type-change4.js");
});

it("Component type change 5", async () => {
  await runTest(__dirname + "/Reconciliation/type-change5.js");
});

it("Component type change 6", async () => {
  await runTest(__dirname + "/Reconciliation/type-change6.js");
});

it("Component type change 7", async () => {
  await runTest(__dirname + "/Reconciliation/type-change7.js");
});

it("Component type change 8", async () => {
  await runTest(__dirname + "/Reconciliation/type-change8.js");
});

it("Component type change 9", async () => {
  await runTest(__dirname + "/Reconciliation/type-change9.js");
});

it("Component type change 10", async () => {
  await runTest(__dirname + "/Reconciliation/type-change10.js");
});

it("Component type change 11", async () => {
  await runTest(__dirname + "/Reconciliation/type-change11.js");
});

it("Component type same", async () => {
  await runTest(__dirname + "/Reconciliation/type-same.js");
});

it("Lazy branched elements", async () => {
  let createElement = React.createElement;
  let count = 0;
  // For this test we want to also check how React.createElement
  // calls occur so we can validate that we are correctly using
  // lazy branched elements. To do this, we override the createElement
  // call and increment a counter for ever call.

  // $FlowFixMe: intentional for this test
  React.createElement = (type, config) => {
    count++;
    return createElement(type, config);
  };
  try {
    await runTest(__dirname + "/Reconciliation/lazy-branched-elements.js");
  } finally {
    // $FlowFixMe: intentional for this test
    React.createElement = createElement;
  }
  // The non-Prepacked version has 4 calls, the Prepacked one should have 4 calls.
  // Multiplied by 4 because every test runs in four modes (JSX/createElement input and output).
  expect(count).toEqual(8 * 4);
});

it("Lazy branched elements 2", async () => {
  let createElement = React.createElement;
  let count = 0;
  // For this test we want to also check how React.createElement
  // calls occur so we can validate that we are correctly using
  // lazy branched elements. To do this, we override the createElement
  // call and increment a counter for ever call.

  // $FlowFixMe: intentional for this test
  React.createElement = (type, config) => {
    count++;
    return createElement(type, config);
  };
  try {
    await runTest(__dirname + "/Reconciliation/lazy-branched-elements2.js");
  } finally {
    // $FlowFixMe: intentional for this test
    React.createElement = createElement;
  }
  // The non-Prepacked version has 4 calls, the Prepacked one should have 3 calls
  // (3 because one of the calls has been removing by inlining).
  // Multiplied by 4 because every test runs in four modes (JSX/createElement input and output).
  expect(count).toEqual(7 * 4);
});
