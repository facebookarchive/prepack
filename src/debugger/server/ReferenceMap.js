/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

// A map with an incrementing counter as the keys
// Used to store references to variable collections since DebugProtocol
// specifies fetching variable collections via unique IDs
export class ReferenceMap<T> {
  constructor() {
    this._counter = 0;
    this._mapping = new Map();
  }
  _counter: number;
  _mapping: Map<number, T>;

  add(value: T): number {
    this._counter++;
    this._mapping.set(this._counter, value);
    return this._counter;
  }

  get(reference: number): void | T {
    return this._mapping.get(reference);
  }

  clean(): void {
    this._counter = 0;
    this._mapping = new Map();
  }
}
