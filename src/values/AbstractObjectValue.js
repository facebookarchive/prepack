/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import type { Descriptor, PropertyKeyValue } from "../types.js";
import { AbstractValue, ObjectValue, StringValue, Value } from "./index.js";
import type { AbstractValueBuildNodeFunction } from "./AbstractValue.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { IsDataDescriptor, cloneDescriptor, equalDescriptors } from "../methods/index.js";
import { Join } from "../singletons.js";
import type { BabelNodeExpression } from "babel-types";
import invariant from "../invariant.js";

export default class AbstractObjectValue extends AbstractValue {
  constructor(
    realm: Realm,
    types: TypesDomain,
    values: ValuesDomain,
    hashValue: number,
    args: Array<Value>,
    buildNode?: AbstractValueBuildNodeFunction | BabelNodeExpression,
    optionalArgs?: {| kind?: string, intrinsicName?: string |}
  ) {
    super(realm, types, values, hashValue, args, buildNode, optionalArgs);
    if (!values.isTop()) {
      for (let element of this.values.getElements()) invariant(element instanceof ObjectValue);
    }
  }

  getTemplate(): ObjectValue {
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      if (element.isPartialObject()) {
        return element;
      } else {
        break;
      }
    }
    AbstractValue.reportIntrospectionError(this);
    throw new FatalError();
  }

  isPartialObject(): boolean {
    // At the very least, the identity of the object is unknown
    return true;
  }

  isSimpleObject(): boolean {
    if (this.values.isTop()) return false;
    let result;
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      if (result === undefined) {
        result = element.isSimpleObject();
      } else if (result !== element.isSimpleObject()) {
        AbstractValue.reportIntrospectionError(this);
        throw new FatalError();
      }
    }
    if (result === undefined) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
    return result;
  }

  mightBeFalse(): boolean {
    return false;
  }

  mightNotBeFalse(): boolean {
    return true;
  }

  makeNotPartial(): void {
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      element.makeNotPartial();
    }
  }

  makePartial(): void {
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      element.makePartial();
    }
  }

  makeSimple(): void {
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      return element.makeSimple();
    }
  }

  throwIfNotObject(): AbstractObjectValue {
    return this;
  }

  // ECMA262 9.1.3
  $IsExtensible(): boolean {
    return false;
  }

  // ECMA262 9.1.5
  $GetOwnProperty(P: PropertyKeyValue): Descriptor | void {
    if (P instanceof StringValue) P = P.value;

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$GetOwnProperty(P, cv);
      }
      invariant(false);
    } else if (this.kind === "conditional") {
      // this is the join of two concrete objects
      // use this join condition for the join of the two property values
      let [cond, ob1, ob2] = this.args;
      invariant(cond instanceof AbstractValue);
      invariant(ob1 instanceof ObjectValue);
      invariant(ob2 instanceof ObjectValue);
      let d1 = ob1.$GetOwnProperty(P);
      let d2 = ob2.$GetOwnProperty(P);
      if (d1 === undefined || d2 === undefined || !equalDescriptors(d1, d2)) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      let desc = cloneDescriptor(d1);
      invariant(desc !== undefined);
      if (IsDataDescriptor(this.$Realm, desc)) {
        let d1Value = d1.value;
        invariant(d1Value === undefined || d1Value instanceof Value);
        let d2Value = d2.value;
        invariant(d2Value === undefined || d2Value instanceof Value);
        desc.value = Join.joinValuesAsConditional(this.$Realm, cond, d1Value, d2Value);
      }
      return desc;
    } else {
      let hasProp = false;
      let doesNotHaveProp = false;
      let desc;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let d = cv.$GetOwnProperty(P);
        if (d === undefined) doesNotHaveProp = true;
        else {
          hasProp = true;
          if (desc === undefined) {
            desc = cloneDescriptor(d);
            invariant(desc !== undefined);
            if (!IsDataDescriptor(this.$Realm, d)) continue;
          } else {
            if (!equalDescriptors(d, desc)) {
              AbstractValue.reportIntrospectionError(this, P);
              throw new FatalError();
            }
            if (!IsDataDescriptor(this.$Realm, desc)) continue;
            // values may be different
            let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
            desc.value = Join.joinValuesAsConditional(this.$Realm, cond, d.value, desc.value);
          }
        }
      }
      if (hasProp && doesNotHaveProp) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      return desc;
    }
  }

  // ECMA262 9.1.6
  $DefineOwnProperty(P: PropertyKeyValue, Desc: Descriptor): boolean {
    if (P instanceof StringValue) P = P.value;
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this, P);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$DefineOwnProperty(P, Desc);
      }
      invariant(false);
    } else {
      if (!IsDataDescriptor(this.$Realm, Desc)) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      let desc = {
        value: "value" in Desc ? Desc.value : this.$Realm.intrinsics.undefined,
        writable: "writable" in Desc ? Desc.writable : false,
        enumerable: "enumerable" in Desc ? Desc.enumerable : false,
        configurable: "configurable" in Desc ? Desc.configurable : false,
      };
      let new_val = desc.value;
      invariant(new_val instanceof Value);
      let sawTrue = false;
      let sawFalse = false;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let d = cv.$GetOwnProperty(P);
        if (d !== undefined && !equalDescriptors(d, desc)) {
          AbstractValue.reportIntrospectionError(this, P);
          throw new FatalError();
        }
        let dval = d === undefined || d.vale === undefined ? this.$Realm.intrinsics.empty : d.value;
        invariant(dval instanceof Value);
        let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
        desc.value = Join.joinValuesAsConditional(this.$Realm, cond, new_val, dval);
        if (cv.$DefineOwnProperty(P, desc)) {
          sawTrue = true;
        } else sawFalse = true;
      }
      if (sawTrue && sawFalse) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      return sawTrue;
    }
  }

  // ECMA262 9.1.7
  $HasProperty(P: PropertyKeyValue): boolean {
    if (P instanceof StringValue) P = P.value;
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this, P);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$HasProperty(P, cv);
      }
      invariant(false);
    } else {
      let hasProp = false;
      let doesNotHaveProp = false;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        if (cv.$HasProperty(P)) hasProp = true;
        else doesNotHaveProp = true;
      }
      if (hasProp && doesNotHaveProp) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      return hasProp;
    }
  }

  // ECMA262 9.1.8
  $Get(P: PropertyKeyValue, Receiver: Value): Value {
    if (P instanceof StringValue) P = P.value;
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this, P);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$Get(P, Receiver);
      }
      invariant(false);
    } else if (this.kind === "conditional") {
      // this is the join of two concrete objects
      // use this join condition for the join of the two property values
      let [cond, ob1, ob2] = this.args;
      invariant(cond instanceof AbstractValue);
      invariant(ob1 instanceof ObjectValue);
      invariant(ob2 instanceof ObjectValue);
      let d1 = ob1.$GetOwnProperty(P);
      let d1val =
        d1 === undefined ? this.$Realm.intrinsics.undefined : IsDataDescriptor(this.$Realm, d1) ? d1.value : undefined;
      let d2 = ob2.$GetOwnProperty(P);
      let d2val =
        d2 === undefined ? this.$Realm.intrinsics.undefined : IsDataDescriptor(this.$Realm, d2) ? d2.value : undefined;
      if (d1val === undefined || d2val === undefined) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      invariant(d1val instanceof Value);
      invariant(d2val instanceof Value);
      return Join.joinValuesAsConditional(this.$Realm, cond, d1val, d2val);
    } else {
      let result;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let d = cv.$GetOwnProperty(P);
        // We do not currently join property getters
        if (d !== undefined && !IsDataDescriptor(this.$Realm, d)) {
          AbstractValue.reportIntrospectionError(this, P);
          throw new FatalError();
        }
        let cvVal = d === undefined ? this.$Realm.intrinsics.undefined : d.value;
        if (result === undefined) result = cvVal;
        else {
          let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
          result = Join.joinValuesAsConditional(this.$Realm, cond, cvVal, result);
        }
      }
      invariant(result !== undefined);
      return result;
    }
  }

  $GetPartial(P: AbstractValue | PropertyKeyValue, Receiver: Value): Value {
    if (!(P instanceof AbstractValue)) return this.$Get(P, Receiver);
    invariant(this === Receiver, "TODO #1021");
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        return cv.$GetPartial(P, cv);
      }
      invariant(false);
    } else {
      let result;
      for (let cv of elements) {
        let cvVal = cv.$GetPartial(P, cv);
        if (result === undefined) result = cvVal;
        else {
          let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
          result = Join.joinValuesAsConditional(this.$Realm, cond, cvVal, result);
        }
      }
      invariant(result !== undefined);
      return result;
    }
  }

  // ECMA262 9.1.9
  $Set(P: PropertyKeyValue, V: Value, Receiver: Value): boolean {
    if (P instanceof StringValue) P = P.value;
    invariant(this === Receiver, "TODO #1021");
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this, P);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$Set(P, V, cv);
      }
      invariant(false);
    } else {
      let sawTrue = false;
      let sawFalse = false;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let d = cv.$GetOwnProperty(P);
        if (d !== undefined && !IsDataDescriptor(this.$Realm, d)) {
          AbstractValue.reportIntrospectionError(this, P);
          throw new FatalError();
        }
        let oldVal = d === undefined ? this.$Realm.intrinsics.empty : d.value;
        let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
        let v = Join.joinValuesAsConditional(this.$Realm, cond, V, oldVal);
        if (cv.$Set(P, v, cv)) sawTrue = true;
        else sawFalse = true;
      }
      if (sawTrue && sawFalse) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      return sawTrue;
    }
  }

  $SetPartial(P: AbstractValue | PropertyKeyValue, V: Value, Receiver: Value): boolean {
    if (!(P instanceof AbstractValue)) return this.$Set(P, V, Receiver);
    invariant(this === Receiver, "TODO #1021");
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$SetPartial(P, V, cv);
      }
      invariant(false);
    } else {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let oldVal = this.$GetPartial(P, Receiver);
        let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
        let v = Join.joinValuesAsConditional(this.$Realm, cond, V, oldVal);
        cv.$SetPartial(P, v, cv);
      }
      return true;
    }
  }

  // ECMA262 9.1.10
  $Delete(P: PropertyKeyValue): boolean {
    if (P instanceof StringValue) P = P.value;
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this, P);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$Delete(P);
      }
      invariant(false);
    } else {
      let sawTrue = false;
      let sawFalse = false;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let d = cv.$GetOwnProperty(P);
        if (d === undefined) continue;
        if (!IsDataDescriptor(this.$Realm, d)) {
          AbstractValue.reportIntrospectionError(this, P);
          throw new FatalError();
        }
        let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
        let v = Join.joinValuesAsConditional(this.$Realm, cond, this.$Realm.intrinsics.empty, d.value);
        if (cv.$Set(P, v, cv)) sawTrue = true;
        else sawFalse = true;
      }
      if (sawTrue && sawFalse) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      return sawTrue;
    }
  }

  $OwnPropertyKeys(): Array<PropertyKeyValue> {
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$OwnPropertyKeys();
      }
      invariant(false);
    } else {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
  }
}
