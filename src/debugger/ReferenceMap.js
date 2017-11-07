/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

// A map with an incrementing counter as the keys
// Used to store references to variable collections since DebugProtocol
// specifies fetching variable collections via unique IDs
export class ReferenceMap<T> {
  constructor(start: number) {
    this._start = start;
    this._counter = start;
    this._mapping = new Map();
  }
  _start: number;
  _counter: number;
  _mapping: { [number]: T };

  add(value: T): number {
    this._counter += 1;
    this._mapping[this._counter] = value;
    return this._counter;
  }

  get(reference: number): void | T {
    if (reference in this._mapping) {
      return this._mapping[reference];
    }
    return undefined;
  }
}
