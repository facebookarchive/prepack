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
  runTest(__dirname + "/ClassComponents/simple.js");
});

it("Simple classes", () => {
  runTest(__dirname + "/ClassComponents/simple-classes.js");
});

it("Simple classes #2", () => {
  runTest(__dirname + "/ClassComponents/simple-classes-2.js");
});

it("Simple classes #3", () => {
  runTest(__dirname + "/ClassComponents/simple-classes-3.js");
});

it("Simple classes with Array.from", () => {
  runTest(__dirname + "/ClassComponents/array-from.js");
});

it("Simple classes with Array.from 2", () => {
  runTest(__dirname + "/ClassComponents/array-from2.js");
});

it("Inheritance chaining", () => {
  runTest(__dirname + "/ClassComponents/inheritance-chain.js");
});

it("Classes with state", () => {
  runTest(__dirname + "/ClassComponents/classes-with-state.js");
});

it("Complex class components folding into functional root component", () => {
  runTest(__dirname + "/ClassComponents/complex-class-into-functional-root.js");
});

it("Complex class components folding into functional root component #2", () => {
  runTest(__dirname + "/ClassComponents/complex-class-into-functional-root2.js");
});

it("Complex class components folding into functional root component #3", () => {
  runTest(__dirname + "/ClassComponents/complex-class-into-functional-root3.js");
});

it("Complex class components folding into functional root component #4", () => {
  runTest(__dirname + "/ClassComponents/complex-class-into-functional-root4.js");
});

it("Complex class components folding into functional root component #5", () => {
  runTest(__dirname + "/ClassComponents/complex-class-into-functional-root5.js");
});

it("Complex class component rendering equivalent node to functional root component", () => {
  runTest(__dirname + "/ClassComponents/complex-class-with-equivalent-node.js");
});

it("Complex class component hoists nodes independently of functional root component", () => {
  runTest(__dirname + "/ClassComponents/complex-class-proper-hoisting.js");
});
