/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { Value } from "../values/index.js";
import type { BabelNodeIdentifier } from "@babel/types";
import invariant from "../invariant.js";
import type { PreludeGenerator } from "../utils/PreludeGenerator.js";
import type { NameGenerator } from "../utils/NameGenerator.js";
import * as t from "@babel/types";

// This class maintains a map of values to babel identifiers.
// This class can optionally track how often such value identifiers are referenced
// when pass 1 is activated, which is usually followed by pass 2 in which
// unneeded identifiers (those which were only ever referenced once) are
// eliminated as the defining expression can be inlined.
export class ResidualHeapValueIdentifiers {
  constructor(values: Iterator<Value>, preludeGenerator: PreludeGenerator) {
    this.collectValToRefCountOnly = false;
    this._valueNameGenerator = preludeGenerator.createNameGenerator("_");
    this._populateIdentifierMap(values);
  }

  initPass1(): void {
    this.collectValToRefCountOnly = true;
    this.valToRefCount = new Map();
  }

  initPass2(): void {
    this.collectValToRefCountOnly = false;
  }

  collectValToRefCountOnly: boolean;
  valToRefCount: void | Map<Value, number>;
  refs: Map<Value, BabelNodeIdentifier>;
  _valueNameGenerator: NameGenerator;

  _populateIdentifierMap(values: Iterator<Value>): void {
    this.refs = new Map();
    for (const val of values) {
      this._setIdentifier(val, this._createNewIdentifier(val));
    }
  }

  _createNewIdentifier(val: Value): BabelNodeIdentifier {
    const name = this._valueNameGenerator.generate(val.__originalName || "");
    return t.identifier(name);
  }

  _setIdentifier(val: Value, id: BabelNodeIdentifier) {
    invariant(!this.refs.has(val));
    this.refs.set(val, id);
  }

  hasIdentifier(val: Value): boolean {
    return this.refs.has(val);
  }

  getIdentifier(val: Value): BabelNodeIdentifier {
    let id = this.refs.get(val);
    invariant(id !== undefined);
    return id;
  }

  deleteIdentifier(val: Value): void {
    invariant(this.refs.has(val));
    this.refs.delete(val);
  }

  getIdentifierAndIncrementReferenceCount(val: Value): BabelNodeIdentifier {
    this.incrementReferenceCount(val);
    let id = this.refs.get(val);
    invariant(id !== undefined, "Value Id cannot be null or undefined");
    return id;
  }

  incrementReferenceCount(val: Value): void {
    if (this.collectValToRefCountOnly) {
      let valToRefCount = this.valToRefCount;
      invariant(valToRefCount !== undefined);
      let refCount = valToRefCount.get(val);
      if (refCount !== undefined) {
        refCount++;
      } else {
        refCount = 1;
      }
      valToRefCount.set(val, refCount);
    }
  }

  needsIdentifier(val: Value): boolean {
    if (this.collectValToRefCountOnly || this.valToRefCount === undefined) return true;
    let refCount = this.valToRefCount.get(val);
    invariant(refCount !== undefined && refCount > 0);
    return refCount !== 1;
  }
}
