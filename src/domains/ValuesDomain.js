/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "../invariant.js";
import type { Realm } from "../realm.js";
import { AbstractValue, ConcreteValue, EmptyValue, Value } from "../values/index.js";

/* An abstract domain that collects together a set of concrete values
   that might be the value of a variable at runtime.
   Initially, every variable has the value undefined.
   A property that has been weakly deleted will have more than
   one value, one of which will by the EmptyValue.  */

export default class ValuesDomain {
  constructor(values: void | Set<ConcreteValue>) {
    this._elements = values;
  }

  static topVal = new ValuesDomain(undefined);

  _elements: void | Set<ConcreteValue>;

  isTop() {
    return this._elements === undefined;
  }

  getElements() {
    invariant(this._elements !== undefined);
    return this._elements;
  }

  includesValueNotOfType(type: typeof Value): boolean {
    if (this.isTop()) return true;
    for (let cval of this.getElements()) {
      if (!(cval instanceof type)) return true;
    }
    return false;
  }

  includesValueOfType(type: typeof Value): boolean {
    if (this.isTop()) return false;
    for (let cval of this.getElements()) {
      if (cval instanceof type) return true;
    }
    return false;
  }

  static joinValues(realm: Realm, v1: void | Value, v2: void | Value): ValuesDomain {
    if (v1 === undefined) v1 = realm.intrinsics.undefined;
    if (v2 === undefined) v2 = realm.intrinsics.undefined;
    if (v1 instanceof AbstractValue) return v1.values.joinWith(v2);
    if (v2 instanceof AbstractValue) return v2.values.joinWith(v1);
    let union = new Set();
    invariant(v1 instanceof ConcreteValue); union.add(v1);
    invariant(v2 instanceof ConcreteValue); union.add(v2);
    return new ValuesDomain(union);
  }

  joinWith(y: Value): ValuesDomain {
    if (this.isTop()) return this;
    let union = new Set(this.getElements());
    if (y instanceof AbstractValue) {
      if (y.values.isTop()) return y.values;
      y.values.getElements().forEach((v) => union.add(v));
    } else {
      invariant(y instanceof ConcreteValue);
      union.add(y);
    }
    return new ValuesDomain(union);
  }

  static meetValues(realm: Realm, v1: void | Value, v2: void | Value): ValuesDomain {
    if (v1 === undefined) v1 = realm.intrinsics.undefined;
    if (v2 === undefined) v2 = realm.intrinsics.undefined;
    if (v1 instanceof AbstractValue) return v1.values.meetWith(v2);
    if (v2 instanceof AbstractValue) return v2.values.meetWith(v1);
    let intersection = new Set();
    invariant(v1 instanceof ConcreteValue);
    invariant(v2 instanceof ConcreteValue);
    if (v1 === v2) intersection.add(v1);
    return new ValuesDomain(intersection);
  }

  meetWith(y: Value): ValuesDomain {
    let intersection = new Set();
    let elements = this._elements;
    if (y instanceof AbstractValue) {
      if (y.values.isTop()) return this;
      y.values.getElements().forEach((v) => {
        if (elements === undefined || elements.has(v)) intersection.add(v);
      });
    } else {
      invariant(y instanceof ConcreteValue);
      if (elements === undefined || elements.has(y)) intersection.add(y);
    }
    return new ValuesDomain(intersection);
  }

  promoteEmptyToUndefined(): ValuesDomain {
    if (this.isTop()) return this;
    let newSet = new Set();
    for (let cval of this.getElements()) {
      if (cval instanceof EmptyValue)
        newSet.add(cval.$Realm.intrinsics.undefined);
      else
        newSet.add(cval);
    }
    return new ValuesDomain(newSet);
  }
}
