// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/**
 * Calls the provided function for a each bad index that should throw a
 * RangeError when passed to an Atomics method on a SAB-backed view where
 * index 125 is out of range.
 *
 * @param f - the function to call for each bad index.
 */
function testWithAtomicsOutOfBoundsIndices(f) {
  var bad_indices = [
    (view) => -1,
    (view) => view.length,
    (view) => view.length*2,
    (view) => Number.POSITIVE_INFINITY,
    (view) => Number.NEGATIVE_INFINITY,
    (view) => ({ valueOf: () => 125 }),
    (view) => ({ toString: () => '125', valueOf: false }) // non-callable valueOf triggers invocation of toString
  ];

  for (let IdxGen of bad_indices) {
    try {
      f(IdxGen);
    } catch (e) {
      e.message += " (Testing with index gen " + IdxGen + ".)";
      throw e;
    }
  }
}

/**
 * Calls the provided function for each good index that should not throw when
 * passed to an Atomics method on a SAB-backed view.
 *
 * The view must have length greater than zero.
 *
 * @param f - the function to call for each good index.
 */
function testWithAtomicsInBoundsIndices(f) {
  // Most of these are eventually coerced to +0 by ToIndex.
  var good_indices = [
    (view) => 0/-1,
    (view) => '-0',
    (view) => undefined,
    (view) => NaN,
    (view) => 0.5,
    (view) => '0.5',
    (view) => -0.9,
    (view) => ({ password: "qumquat" }),
    (view) => view.length - 1,
    (view) => ({ valueOf: () => 0 }),
    (view) => ({ toString: () => '0', valueOf: false }) // non-callable valueOf triggers invocation of toString
  ];

  for (let IdxGen of good_indices) {
    try {
      f(IdxGen);
    } catch (e) {
      e.message += " (Testing with index gen " + IdxGen + ".)";
      throw e;
    }
  }
}

/**
 * Calls the provided function for each value that should throw a TypeError
 * when passed to an Atomics method as a view.
 *
 * @param f - the function to call for each non-view value.
 */

function testWithAtomicsNonViewValues(f) {
  var values = [
    null,
    undefined,
    true,
    false,
    new Boolean(true),
    10,
    3.14,
    new Number(4),
    "Hi there",
    new Date,
    /a*utomaton/g,
    { password: "qumquat" },
    new DataView(new ArrayBuffer(10)),
    new ArrayBuffer(128),
    new SharedArrayBuffer(128),
    new Error("Ouch"),
    [1,1,2,3,5,8],
    ((x) => -x),
    new Map(),
    new Set(),
    new WeakMap(),
    new WeakSet(),
    Symbol("halleluja"),
    // TODO: Proxy?
    Object,
    Int32Array,
    Date,
    Math,
    Atomics
  ];

  for (let nonView of values) {
    try {
      f(nonView);
    } catch (e) {
      e.message += " (Testing with non-view value " + nonView + ".)";
      throw e;
    }
  }
}
