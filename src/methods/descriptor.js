/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { PropertyDescriptor } from "../descriptors";

export function cloneDescriptor(d: void | PropertyDescriptor): void | PropertyDescriptor {
  if (d === undefined) return undefined;
  return new PropertyDescriptor(d);
}

// does not check if the contents of value properties are the same
export function equalDescriptors(d1: PropertyDescriptor, d2: PropertyDescriptor): boolean {
  if (d1.hasOwnProperty("writable")) {
    if (!d2.hasOwnProperty("writable")) return false;
    if (d1.writable !== d2.writable) return false;
  }
  if (d1.hasOwnProperty("enumerable")) {
    if (!d2.hasOwnProperty("enumerable")) return false;
    if (d1.enumerable !== d2.enumerable) return false;
  }
  if (d1.hasOwnProperty("configurable")) {
    if (!d2.hasOwnProperty("configurable")) return false;
    if (d1.configurable !== d2.configurable) return false;
  }
  if (d1.hasOwnProperty("value")) {
    if (!d2.hasOwnProperty("value")) return false;
  }
  if (d1.hasOwnProperty("get")) {
    if (!d2.hasOwnProperty("get")) return false;
    if (d1.get !== d2.get) return false;
  }
  if (d1.hasOwnProperty("set")) {
    if (!d2.hasOwnProperty("set")) return false;
    if (d1.set !== d2.set) return false;
  }
  return true;
}
