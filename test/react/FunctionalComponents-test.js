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

it("Simple", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple.js");
});

it("Simple 2", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-2.js");
});

it("Simple 3", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-3.js");
});

it("Simple 4", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-4.js");
});

it("Simple 5", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-5.js");
});

it("Simple 6", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-6.js");
});

it("Simple 7", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-7.js");
});

it("Simple 8", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FunctionalComponents/simple-8.js");
  });
});

it("Simple 9", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FunctionalComponents/simple-9.js");
  });
});

it("Simple 10", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FunctionalComponents/simple-10.js");
  });
});

it("Simple 11", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FunctionalComponents/simple-11.js");
  });
});

it("Simple 12", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-12.js");
});

it("Runtime error", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FunctionalComponents/runtime-error.js");
  });
});

it("Simple 13", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FunctionalComponents/simple-13.js");
  });
});

it("Simple 14", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-14.js");
});

it("Simple 15", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-15.js");
});

it("Simple 16", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-16.js");
});

it("Simple 17", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-17.js");
});

it("Simple 18", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-18.js");
});

it("Simple 19", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-19.js");
});

it("Simple 20", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-20.js");
});

it("Simple 21", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-21.js");
});

it("Two roots", async () => {
  await runTest(__dirname + "/FunctionalComponents/two-roots.js");
});

it("Havocing of ReactElements should not result in property assignments", async () => {
  await runTest(__dirname + "/FunctionalComponents/react-element-havoc.js");
});

it("__reactCompilerDoNotOptimize", async () => {
  await runTest(__dirname + "/FunctionalComponents/do-not-optimize.js");
});

it("Mutations - not-safe 1", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FunctionalComponents/not-safe.js");
  });
});

it("Mutations - not-safe 2", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FunctionalComponents/not-safe2.js");
  });
});

it("Mutations - not-safe 3", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FunctionalComponents/not-safe3.js");
  });
});

it("Mutations - safe 1", async () => {
  await runTest(__dirname + "/FunctionalComponents/safe.js");
});

it("Mutations - safe 2", async () => {
  await runTest(__dirname + "/FunctionalComponents/safe2.js");
});

it("Mutations - safe 3", async () => {
  await runTest(__dirname + "/FunctionalComponents/safe3.js");
});

it("Handle mapped arrays", async () => {
  await runTest(__dirname + "/FunctionalComponents/array-map.js");
});

it("Handle mapped arrays 2", async () => {
  await runTest(__dirname + "/FunctionalComponents/array-map2.js");
});

it("Handle mapped arrays from Array.from", async () => {
  await runTest(__dirname + "/FunctionalComponents/array-from.js");
});

it("Simple fragments", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-fragments.js");
});

it("Simple children", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-children.js");
});

it("Simple with new expression", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-new-expression.js");
});

it("Simple refs", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-refs.js");
});

it("16.3 refs", async () => {
  await runTest(__dirname + "/FunctionalComponents/refs.js");
});

it("16.3 refs 2", async () => {
  await runTest(__dirname + "/FunctionalComponents/refs2.js");
});

it("16.3 refs 3", async () => {
  await runTest(__dirname + "/FunctionalComponents/refs3.js");
});

it("defaultProps", async () => {
  await runTest(__dirname + "/FunctionalComponents/default-props.js");
});

it("Unsafe spread", async () => {
  await expectPartialKeyOrRefError(async () => {
    await runTest(__dirname + "/FunctionalComponents/unsafe-spread.js");
  });
});

it("Simple with abstract props", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-abstract-props.js");
});

it("Simple with unary expressions", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-unary.js");
});

it("Simple with multiple JSX spreads", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread.js");
});

it("Simple with multiple JSX spreads #2", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread2.js");
});

it("Simple with multiple JSX spreads #3", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread3.js");
});

it("Simple with multiple JSX spreads #4", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread4.js");
});

it("Simple with multiple JSX spreads #5", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread5.js");
});

it("Simple with multiple JSX spreads #6", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread6.js");
});

it("Simple with multiple JSX spreads #7", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread7.js");
});

it("Simple with multiple JSX spreads #8", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread8.js");
});

it("Simple with multiple JSX spreads #9", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread9.js");
});

it("Simple with multiple JSX spreads #10", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread10.js");
});

it("Simple with multiple JSX spreads #11", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread11.js");
});

it("Simple with multiple JSX spreads #12", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread12.js");
});

it("Simple with multiple JSX spreads #13", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-with-jsx-spread13.js");
});

it("Simple with Object.assign", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-assign.js");
});

it("Simple with Object.assign #2", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-assign2.js");
});

it("Simple with Object.assign #3", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-assign3.js");
});

it("Simple with Object.assign #4", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-assign4.js");
});

it("Simple with Object.assign #5", async () => {
  await runTest(__dirname + "/FunctionalComponents/simple-assign5.js");
});

it("Circular reference", async () => {
  await runTest(__dirname + "/FunctionalComponents/circular-reference.js");
});

it("Conditional", async () => {
  await runTest(__dirname + "/FunctionalComponents/conditional.js");
});

it("Key nesting", async () => {
  await runTest(__dirname + "/FunctionalComponents/key-nesting.js");
});

it("Key nesting 2", async () => {
  await runTest(__dirname + "/FunctionalComponents/key-nesting-2.js");
});

it("Key nesting 3", async () => {
  await runTest(__dirname + "/FunctionalComponents/key-nesting-3.js");
});

it("Key change", async () => {
  await runTest(__dirname + "/FunctionalComponents/key-change.js");
});

it("Equivalence", async () => {
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
    await runTest(__dirname + "/FunctionalComponents/equivalence.js");
  } finally {
    // $FlowFixMe: intentional for this test
    React.createElement = createElement;
  }
  // The non-Prepacked version has 20 calls, the Prepacked one should have 8 calls.
  // Multiplied by 4 because every test runs in four modes (JSX/createElement input and output).
  expect(count).toEqual(28 * 4);
});

it("Delete element prop key", async () => {
  await runTest(__dirname + "/FunctionalComponents/delete-element-prop-key.js");
});

it("Key change with fragments", async () => {
  await runTest(__dirname + "/FunctionalComponents/key-change-fragments.js");
});

it("Key not changing with fragments", async () => {
  await runTest(__dirname + "/FunctionalComponents/key-not-change-fragments.js");
});

it("Component type change", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change.js");
});

it("Component type change 2", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change2.js");
});

it("Component type change 3", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change3.js");
});

it("Component type change 4", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change4.js");
});

it("Component type change 5", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change5.js");
});

it("Component type change 6", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change6.js");
});

it("Component type change 7", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change7.js");
});

it("Component type change 8", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change8.js");
});

it("Component type change 9", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change9.js");
});

it("Component type change 10", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change10.js");
});

it("Component type change 11", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-change11.js");
});

it("Component type same", async () => {
  await runTest(__dirname + "/FunctionalComponents/type-same.js");
});

it("Dynamic props", async () => {
  await runTest(__dirname + "/FunctionalComponents/dynamic-props.js");
});

it("Dynamic context", async () => {
  await runTest(__dirname + "/FunctionalComponents/dynamic-context.js");
});

it("React.cloneElement", async () => {
  await runTest(__dirname + "/FunctionalComponents/clone-element.js");
});

it("Return text", async () => {
  await runTest(__dirname + "/FunctionalComponents/return-text.js");
});

it("Render array twice", async () => {
  await runTest(__dirname + "/FunctionalComponents/array-twice.js");
});

it("Render nested array children", async () => {
  await runTest(__dirname + "/FunctionalComponents/nested-array-children.js");
});

it("Return undefined", async () => {
  await runTest(__dirname + "/FunctionalComponents/return-undefined.js");
});

it("Null or undefined props", async () => {
  await runTest(__dirname + "/FunctionalComponents/null-or-undefined-props.js");
});

it("Event handlers", async () => {
  await runTest(__dirname + "/FunctionalComponents/event-handlers.js");
});

it("Class component as root", async () => {
  await runTest(__dirname + "/FunctionalComponents/class-root.js");
});

it("Class component as root with multiple render methods", async () => {
  await runTest(__dirname + "/FunctionalComponents/class-root-with-render-methods.js");
});

it("Class component as root with props", async () => {
  await runTest(__dirname + "/FunctionalComponents/class-root-with-props.js");
});

it("Class component as root with state", async () => {
  await runTest(__dirname + "/FunctionalComponents/class-root-with-state.js");
});

it("Class component as root with refs", async () => {
  await runTest(__dirname + "/FunctionalComponents/class-root-with-refs.js");
});

it("Class component as root with instance variables", async () => {
  await runTest(__dirname + "/FunctionalComponents/class-root-with-instance-vars.js");
});

it("Class component as root with instance variables #2", async () => {
  await runTest(__dirname + "/FunctionalComponents/class-root-with-instance-vars-2.js");
});

it("Additional functions closure scope capturing", async () => {
  await runTest(__dirname + "/FunctionalComponents/additional-function-regression.js");
});

it("Dynamic ReactElement type", async () => {
  await runTest(__dirname + "/FunctionalComponents/dynamic-type.js");
});

it("Dynamic ReactElement type #2", async () => {
  await runTest(__dirname + "/FunctionalComponents/dynamic-type2.js");
});

it("Dynamic ReactElement type #3", async () => {
  await runTest(__dirname + "/FunctionalComponents/dynamic-type3.js");
});

it("Dynamic ReactElement type #4", async () => {
  await runTest(__dirname + "/FunctionalComponents/dynamic-type4.js");
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
    await runTest(__dirname + "/FunctionalComponents/lazy-branched-elements.js");
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
    await runTest(__dirname + "/FunctionalComponents/lazy-branched-elements2.js");
  } finally {
    // $FlowFixMe: intentional for this test
    React.createElement = createElement;
  }
  // The non-Prepacked version has 4 calls, the Prepacked one should have 3 calls
  // (3 because one of the calls has been removing by inlining).
  // Multiplied by 4 because every test runs in four modes (JSX/createElement input and output).
  expect(count).toEqual(7 * 4);
});
