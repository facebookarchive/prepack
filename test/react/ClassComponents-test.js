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
  await runTest(__dirname + "/ClassComponents/simple.js");
});

it("Simple classes", async () => {
  await runTest(__dirname + "/ClassComponents/simple-classes.js");
});

it("Simple classes #2", async () => {
  await runTest(__dirname + "/ClassComponents/simple-classes-2.js");
});

it("Simple classes #3", async () => {
  await runTest(__dirname + "/ClassComponents/simple-classes-3.js");
});

it("Simple classes with Array.from", async () => {
  await runTest(__dirname + "/ClassComponents/array-from.js");
});

it("Simple classes with Array.from 2", async () => {
  await runTest(__dirname + "/ClassComponents/array-from2.js");
});

it("Inheritance chaining", async () => {
  await runTest(__dirname + "/ClassComponents/inheritance-chain.js");
});

it("Classes with state", async () => {
  await runTest(__dirname + "/ClassComponents/classes-with-state.js");
});

it("Complex class components folding into functional root component", async () => {
  await runTest(__dirname + "/ClassComponents/complex-class-into-functional-root.js");
});

it("Complex class components folding into functional root component #2", async () => {
  await runTest(__dirname + "/ClassComponents/complex-class-into-functional-root2.js");
});

it("Complex class components folding into functional root component #3", async () => {
  await runTest(__dirname + "/ClassComponents/complex-class-into-functional-root3.js");
});

it("Complex class components folding into functional root component #4", async () => {
  await runTest(__dirname + "/ClassComponents/complex-class-into-functional-root4.js");
});

it("Complex class components folding into functional root component #5", async () => {
  await runTest(__dirname + "/ClassComponents/complex-class-into-functional-root5.js");
});
