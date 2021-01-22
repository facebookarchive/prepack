/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelBinaryOperator, BabelUnaryOperator } from "@babel/types";
import invariant from "../invariant.js";

interface Hashable {
  getHash(): number;
  mightBeString(): boolean;
  mightBeObject(): boolean;
}

export function hashBinary<T: Hashable>(op: BabelBinaryOperator, x: T, y: T): [number, Array<T>] {
  let xHash = x.getHash();
  let yHash = y.getHash();
  if (yHash < xHash) {
    // Check if the operation is commutative so that we can normalize the arguments on hash value order.
    let commutative;
    switch (op) {
      case "*":
      case "==":
      case "!=":
      case "===":
      case "!==":
        // If both operands might be objects, the operation does not commute because of the possibility
        // that arbitrary code can run on both operands while converting them, in which case the order of the
        // operands must be maintained to make sure any side-effects happen in the right order.
        commutative = !(x.mightBeObject() && y.mightBeObject());
        break;
      case "+":
        // As above, but in addition, if one of the operands might be a string the operation does not commute
        commutative = !(x.mightBeObject() && y.mightBeObject()) && !(x.mightBeString() || y.mightBeString());
        break;
      default:
        // The operation itself is not commutative
        commutative = false;
        break;
    }
    if (commutative) {
      [x, y] = [y, x];
      [xHash, yHash] = [yHash, xHash];
    }
  }
  let hash = (((hashString(op) * 13) ^ xHash) * 13) ^ yHash;
  return [hash, [x, y]];
}

export function hashCall<T: Hashable>(calleeName: string, ...args: Array<T>): [number, Array<T>] {
  let hash = hashString(calleeName);
  for (let a of args) hash = (hash * 13) ^ a.getHash();
  return [hash, args];
}

export function hashTernary<T: Hashable>(x: T, y: T, z: T): [number, Array<T>] {
  let hash = (((x.getHash() * 13) ^ y.getHash()) * 13) ^ z.getHash();
  return [hash, [x, y, z]];
}

export function hashString(value: string): number {
  let hash = 5381;
  for (let i = value.length - 1; i >= 0; i--) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash;
}

export function hashUnary(op: BabelUnaryOperator, x: Hashable): number {
  return (hashString(op) * 13) ^ x.getHash();
}

interface Equatable {
  equals(x: any): boolean;
}

export class HashSet<T: Equatable & Hashable> {
  constructor(expectedEntries?: number = 32 * 1024) {
    let initialSize = 16;
    expectedEntries *= 2;
    while (initialSize < expectedEntries) initialSize *= 2;
    this._entries = new Array(initialSize);
    this._count = 0;
  }

  _count: number;
  _entries: Array<void | T>;

  add(e: T): T {
    let entries = this._entries;
    let n = entries.length;
    let key = e.getHash();
    let i = key & (n - 1);
    while (true) {
      let entry = entries[i];
      if (entry === undefined) {
        entries[i] = e;
        if (++this._count > n / 2) this.expand();
        return e;
      } else if (e.equals(entry)) {
        return entry;
      }
      if (++i >= n) i = 0;
    }
    invariant(false); // otherwise Flow thinks this method can return undefined
  }

  expand(): void {
    let oldEntries = this._entries;
    let n = oldEntries.length;
    let m = n * 2;
    if (m <= 0) return;
    let entries = new Array(m);
    for (let i = 0; i < n; i++) {
      let oldEntry = oldEntries[i];
      if (oldEntry === undefined) continue;
      let key = oldEntry.getHash();
      let j = key & (m - 1);
      while (true) {
        let entry = entries[j];
        if (entry === undefined) {
          entries[j] = oldEntry;
          break;
        }
        if (++j >= m) j = 0;
      }
    }
    this._entries = entries;
  }
}
