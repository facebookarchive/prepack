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

it("Unsafe spread", () => {
  runTest(__dirname + "/AssignSpread/unsafe-spread.js", {
    expectReconcilerError: true,
    // Don't attempt to recover even from PP0025.
    shouldRecover: () => false,
  });
});

it("Simple with multiple JSX spreads", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread.js");
});

it("Simple with multiple JSX spreads #2", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread2.js");
});

it("Simple with multiple JSX spreads #3", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread3.js");
});

it("Simple with multiple JSX spreads #4", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread4.js");
});

it("Simple with multiple JSX spreads #5", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread5.js");
});

it("Simple with multiple JSX spreads #6", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread6.js");
});

it("Simple with multiple JSX spreads #7", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread7.js");
});

it("Simple with multiple JSX spreads #8", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread8.js");
});

it("Simple with multiple JSX spreads #9", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread9.js");
});

it("Simple with multiple JSX spreads #10", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread10.js");
});

it("Simple with multiple JSX spreads #11", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread11.js");
});

it("Simple with multiple JSX spreads #12", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread12.js");
});

it("Simple with multiple JSX spreads #13", () => {
  runTest(__dirname + "/AssignSpread/simple-with-jsx-spread13.js");
});

it("Simple with Object.assign", () => {
  runTest(__dirname + "/AssignSpread/simple-assign.js");
});

it("Simple with Object.assign #2", () => {
  runTest(__dirname + "/AssignSpread/simple-assign2.js");
});

it("Simple with Object.assign #3", () => {
  runTest(__dirname + "/AssignSpread/simple-assign3.js");
});

it("Simple with Object.assign #4", () => {
  runTest(__dirname + "/AssignSpread/simple-assign4.js");
});

it("Simple with Object.assign #5", () => {
  runTest(__dirname + "/AssignSpread/simple-assign5.js");
});
