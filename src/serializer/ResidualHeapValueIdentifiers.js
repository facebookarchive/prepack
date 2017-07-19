/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Value } from "../values/index.js";
import type { BabelNodeIdentifier } from "babel-types";
import invariant from "../invariant.js";

// This class maintains a map of values to babel identifiers.
// This class can optionally track how often such value identifiers are referenced
// when pass 1 is activated, which is usually followed by pass 2 in which
// unneeded identifiers (those which were only ever referenced once) are
// eliminated as  the defining expression can be inlined.
export class ResidualHeapValueIdentifiers {
  constructor() {
    this.collectValToRefCountOnly = false;
    this.refs = new Map();
  }

  initPass1() {
    this.collectValToRefCountOnly = true;
    this.valToRefCount = new Map();
    this.referencedDerivedIds = new Set();
    this.inInvariantSection = false;
  }

  initPass2() {
    this.collectValToRefCountOnly = false;
    this.refs = new Map();
  }

  collectValToRefCountOnly: boolean;
  valToRefCount: void | Map<Value, number>;
  // If the corresponding AbstractValue for a derivedId is never requested,
  // we can eliminate it if it is also pure.
  referencedDerivedIds: Set<BabelNodeIdentifier>;
  inInvariantSection: boolean;
  //value to intermediate references generated like $0, $1, $2,...
  refs: Map<Value, BabelNodeIdentifier>;

  startInvariant(): boolean {
    let previous = this.inInvariantSection;
    this.inInvariantSection = true;
    return previous;
  }

  endInvariant(previousValue: boolean) {
    this.inInvariantSection = previousValue;
  }

  // Should only be done if this is an actual reference and not an invariant
  recordDerivedIdReference(derivedId: BabelNodeIdentifier) {
    if (this.collectValToRefCountOnly) {
      let referencedDerivedIds = this.referencedDerivedIds;
      invariant(referencedDerivedIds);
      if (!this.inInvariantSection) {
        referencedDerivedIds.add(derivedId);
      }
    }
  }

  canOmitDerivedId(derivedId: BabelNodeIdentifier) {
    let referencedDerivedIds = this.referencedDerivedIds;
    if (this.collectValToRefCountOnly || !referencedDerivedIds) return false;
    invariant(referencedDerivedIds);
    return !referencedDerivedIds.has(derivedId);
  }

  setIdentifier(val: Value, id: BabelNodeIdentifier) {
    invariant(!this.refs.has(val));
    this.refs.set(val, id);
  }

  getIdentifier(val: Value): BabelNodeIdentifier {
    let id = this.refs.get(val);
    invariant(id !== undefined);
    return id;
  }

  deleteIdentifier(val: Value) {
    invariant(this.refs.has(val));
    this.refs.delete(val);
  }

  getIdentifierAndIncrementReferenceCount(val: Value): BabelNodeIdentifier {
    let id = this.getIdentifierAndIncrementReferenceCountOptional(val);
    invariant(id !== undefined, "Value Id cannot be null or undefined");
    return id;
  }

  getIdentifierAndIncrementReferenceCountOptional(val: Value): void | BabelNodeIdentifier {
    let id = this.refs.get(val);
    if (id !== undefined) {
      this.incrementReferenceCount(val);
    }
    return id;
  }

  incrementReferenceCount(val: Value) {
    if (this.collectValToRefCountOnly) {
      let valToRefCount = this.valToRefCount;
      invariant(valToRefCount !== undefined);
      let refCount = valToRefCount.get(val);
      if (refCount) {
        refCount++;
      } else {
        refCount = 1;
      }
      valToRefCount.set(val, refCount);
    }
  }

  needsIdentifier(val: Value) {
    if (this.collectValToRefCountOnly || this.valToRefCount === undefined) return true;
    let refCount = this.valToRefCount.get(val);
    invariant(refCount !== undefined && refCount > 0);
    return refCount !== 1;
  }
}
