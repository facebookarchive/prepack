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

it("Simple", () => {
  runTest(__dirname + "/FunctionalComponents/simple.js");
});

it("Simple 2", () => {
  runTest(__dirname + "/FunctionalComponents/simple-2.js");
});

it("Simple 3", () => {
  runTest(__dirname + "/FunctionalComponents/simple-3.js");
});

it("Simple 4", () => {
  runTest(__dirname + "/FunctionalComponents/simple-4.js");
});

it("Simple 5", () => {
  runTest(__dirname + "/FunctionalComponents/simple-5.js");
});

it("Simple 6", () => {
  runTest(__dirname + "/FunctionalComponents/simple-6.js");
});

it("Simple 7", () => {
  runTest(__dirname + "/FunctionalComponents/simple-7.js");
});

it("Simple 8", () => {
  runTest(__dirname + "/FunctionalComponents/simple-8.js", {
    expectReconcilerError: true,
  });
});

it("Simple 9", () => {
  runTest(__dirname + "/FunctionalComponents/simple-9.js", {
    expectReconcilerError: true,
  });
});

it("Simple 10", () => {
  runTest(__dirname + "/FunctionalComponents/simple-10.js", {
    expectReconcilerError: true,
  });
});

it("Simple 11", () => {
  runTest(__dirname + "/FunctionalComponents/simple-11.js", {
    expectReconcilerError: true,
  });
});

it("Simple 12", () => {
  runTest(__dirname + "/FunctionalComponents/simple-12.js");
});

it("Runtime error", () => {
  runTest(__dirname + "/FunctionalComponents/runtime-error.js", {
    expectRuntimeError: true,
  });
});

it("Simple 13", () => {
  runTest(__dirname + "/FunctionalComponents/simple-13.js", {
    expectReconcilerError: true,
  });
});

it("Simple 14", () => {
  runTest(__dirname + "/FunctionalComponents/simple-14.js");
});

it("Simple 15", () => {
  runTest(__dirname + "/FunctionalComponents/simple-15.js");
});

it("Simple 16", () => {
  runTest(__dirname + "/FunctionalComponents/simple-16.js");
});

it("Simple 17", () => {
  runTest(__dirname + "/FunctionalComponents/simple-17.js");
});

it("Simple 18", () => {
  runTest(__dirname + "/FunctionalComponents/simple-18.js");
});

it("Simple 19", () => {
  runTest(__dirname + "/FunctionalComponents/simple-19.js");
});

it("Simple 20", () => {
  runTest(__dirname + "/FunctionalComponents/simple-20.js");
});

it("Simple 21", () => {
  runTest(__dirname + "/FunctionalComponents/simple-21.js");
});

it("Simple 22", () => {
  runTest(__dirname + "/FunctionalComponents/simple-22.js");
});

it("Simple 23", () => {
  runTest(__dirname + "/FunctionalComponents/simple-23.js");
});

it("Simple 24", () => {
  runTest(__dirname + "/FunctionalComponents/simple-24.js");
});

it("Simple 25", () => {
  runTest(__dirname + "/FunctionalComponents/simple-25.js");
});

it("Simple 26", () => {
  runTest(__dirname + "/FunctionalComponents/simple-26.js");
});

it("Simple 27", () => {
  runTest(__dirname + "/FunctionalComponents/simple-27.js");
});

it("Simple 28", () => {
  runTest(__dirname + "/FunctionalComponents/simple-28.js");
});

it("Simple 29", () => {
  runTest(__dirname + "/FunctionalComponents/simple-29.js");
});

it("Bound type", () => {
  runTest(__dirname + "/FunctionalComponents/bound-type.js");
});

it("Bound type 2", () => {
  runTest(__dirname + "/FunctionalComponents/bound-type2.js");
});

it("React.Children.map", () => {
  runTest(__dirname + "/FunctionalComponents/react-children-map.js");
});

it("Two roots", () => {
  runTest(__dirname + "/FunctionalComponents/two-roots.js");
});

it("Havocing of ReactElements should not result in property assignments", () => {
  runTest(__dirname + "/FunctionalComponents/react-element-havoc.js");
});

it("__reactCompilerDoNotOptimize", () => {
  runTest(__dirname + "/FunctionalComponents/do-not-optimize.js");
});

it("Mutations - not-safe 1", () => {
  runTest(__dirname + "/FunctionalComponents/not-safe.js", {
    expectReconcilerError: true,
  });
});

it("Mutations - not-safe 2", () => {
  runTest(__dirname + "/FunctionalComponents/not-safe2.js", {
    expectReconcilerError: true,
  });
});

it("Mutations - safe 1", () => {
  runTest(__dirname + "/FunctionalComponents/safe.js");
});

it("Mutations - safe 2", () => {
  runTest(__dirname + "/FunctionalComponents/safe2.js");
});

it("Mutations - safe 3", () => {
  runTest(__dirname + "/FunctionalComponents/safe3.js");
});

it("Handle mapped arrays", () => {
  runTest(__dirname + "/FunctionalComponents/array-map.js");
});

it("Handle mapped arrays 2", () => {
  runTest(__dirname + "/FunctionalComponents/array-map2.js");
});

it("Handle mapped arrays 3", () => {
  runTest(__dirname + "/FunctionalComponents/array-map3.js");
});

it("Handle mapped arrays from Array.from", () => {
  runTest(__dirname + "/FunctionalComponents/array-from.js");
});

it("Simple fragments", () => {
  runTest(__dirname + "/FunctionalComponents/simple-fragments.js");
});

it("Simple children", () => {
  runTest(__dirname + "/FunctionalComponents/simple-children.js");
});

it("Simple with new expression", () => {
  runTest(__dirname + "/FunctionalComponents/simple-with-new-expression.js");
});

it("Simple refs", () => {
  runTest(__dirname + "/FunctionalComponents/simple-refs.js");
});

it("16.3 refs", () => {
  runTest(__dirname + "/FunctionalComponents/refs.js");
});

it("16.3 refs 2", () => {
  runTest(__dirname + "/FunctionalComponents/refs2.js");
});

it("16.3 refs 3", () => {
  runTest(__dirname + "/FunctionalComponents/refs3.js");
});

it("refs typeof", () => {
  runTest(__dirname + "/FunctionalComponents/refs-typeof.js");
});

it("defaultProps", () => {
  runTest(__dirname + "/FunctionalComponents/default-props.js");
});

it("defaultProps 2", () => {
  runTest(__dirname + "/FunctionalComponents/default-props2.js");
});

it("Simple with abstract props", () => {
  runTest(__dirname + "/FunctionalComponents/simple-with-abstract-props.js");
});

it("Simple with unary expressions", () => {
  runTest(__dirname + "/FunctionalComponents/simple-with-unary.js");
});

it("Circular reference", () => {
  runTest(__dirname + "/FunctionalComponents/circular-reference.js");
});

it("Conditional", () => {
  runTest(__dirname + "/FunctionalComponents/conditional.js");
});

it("Equivalence", () => {
  runTest(__dirname + "/FunctionalComponents/equivalence.js", {
    expectedCreateElementCalls: /* original */ 20 + /* prepacked: many deduplicated */ 8,
  });
});

it("Delete element prop key", () => {
  runTest(__dirname + "/FunctionalComponents/delete-element-prop-key.js");
});

it("Dynamic props", () => {
  runTest(__dirname + "/FunctionalComponents/dynamic-props.js");
});

it("Dynamic context", () => {
  runTest(__dirname + "/FunctionalComponents/dynamic-context.js");
});

it("React.cloneElement", () => {
  runTest(__dirname + "/FunctionalComponents/clone-element.js");
});

it("React.cloneElement 2", () => {
  runTest(__dirname + "/FunctionalComponents/clone-element2.js");
});

it("Return text", () => {
  runTest(__dirname + "/FunctionalComponents/return-text.js");
});

it("Render array twice", () => {
  runTest(__dirname + "/FunctionalComponents/array-twice.js");
});

it("Render nested array children", () => {
  runTest(__dirname + "/FunctionalComponents/nested-array-children.js");
});

it("Return undefined", () => {
  runTest(__dirname + "/FunctionalComponents/return-undefined.js");
});

it("Null or undefined props", () => {
  runTest(__dirname + "/FunctionalComponents/null-or-undefined-props.js");
});

it("Event handlers", () => {
  runTest(__dirname + "/FunctionalComponents/event-handlers.js");
});

it("Class component as root", () => {
  runTest(__dirname + "/FunctionalComponents/class-root.js");
});

it("Class component as root with multiple render methods", () => {
  runTest(__dirname + "/FunctionalComponents/class-root-with-render-methods.js");
});

it("Class component as root with props", () => {
  runTest(__dirname + "/FunctionalComponents/class-root-with-props.js");
});

it("Class component as root with state", () => {
  runTest(__dirname + "/FunctionalComponents/class-root-with-state.js");
});

it("Class component as root with refs", () => {
  runTest(__dirname + "/FunctionalComponents/class-root-with-refs.js");
});

it("Class component as root with instance variables", () => {
  runTest(__dirname + "/FunctionalComponents/class-root-with-instance-vars.js");
});

it("Class component as root with instance variables #2", () => {
  runTest(__dirname + "/FunctionalComponents/class-root-with-instance-vars-2.js");
});

it("Additional functions closure scope capturing", () => {
  runTest(__dirname + "/FunctionalComponents/additional-function-regression.js");
});

it("Dynamic ReactElement type", () => {
  runTest(__dirname + "/FunctionalComponents/dynamic-type.js");
});

it("Dynamic ReactElement type #2", () => {
  runTest(__dirname + "/FunctionalComponents/dynamic-type2.js");
});

it("Dynamic ReactElement type #3", () => {
  runTest(__dirname + "/FunctionalComponents/dynamic-type3.js");
});

it("Dynamic ReactElement type #4", () => {
  runTest(__dirname + "/FunctionalComponents/dynamic-type4.js");
});

it("Hoist Fragment", () => {
  runTest(__dirname + "/FunctionalComponents/hoist-fragment.js");
});

it("Pathological case", () => {
  runTest(__dirname + "/FunctionalComponents/pathological-case.js");
});

it("Model props", () => {
  runTest(__dirname + "/FunctionalComponents/model-props.js");
});

it("Inline keys", () => {
  runTest(__dirname + "/FunctionalComponents/keyed.js");
});

it("Inline unnecessary keys", () => {
  runTest(__dirname + "/FunctionalComponents/keyed-unnecessarily.js");
});

it("Inline key on component that does not return element", () => {
  runTest(__dirname + "/FunctionalComponents/keyed-non-element.js");
});
