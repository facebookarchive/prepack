/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { AbstractValue, ConcreteValue, FunctionValue, ObjectValue, PrimitiveValue, UndefinedValue, Value } from "../values/index.js";
import invariant from "../invariant.js";

/* An abstract domain for the type of value a variable might have.  */

export default class TypesDomain {
  constructor(type: void | typeof Value) {
    invariant(type !== ConcreteValue, "Concrete values must be specific");
    this._type = type === Value ? undefined : type;
  }

  static topVal: TypesDomain = new TypesDomain(undefined);

  _type: void | typeof Value;

  getType(): typeof Value {
    return this._type || Value;
  }

  static joinValues(v1: void | Value, v2: void | Value): TypesDomain {
    if (v1 === undefined && v2 === undefined) return new TypesDomain(UndefinedValue);
    if (v1 === undefined || v2 === undefined) return TypesDomain.topVal;
    if (v1 instanceof AbstractValue)
      return v1.types.joinWith(v2.getType());
    if (v2 instanceof AbstractValue)
      return v2.types.joinWith(v1.getType());
    return (new TypesDomain(v1.getType())).joinWith(v2.getType());
  }

  joinWith(t: typeof Value): TypesDomain  {
    let type = this.getType();
    if (type === t) return this;
    if (Value.isTypeCompatibleWith(type, FunctionValue) &&
        Value.isTypeCompatibleWith(t, FunctionValue)) {
      return new TypesDomain(FunctionValue);
    }
    if (Value.isTypeCompatibleWith(type, ObjectValue) &&
        Value.isTypeCompatibleWith(t, ObjectValue)) {
      return new TypesDomain(ObjectValue);
    }
    if (Value.isTypeCompatibleWith(type, PrimitiveValue) &&
        Value.isTypeCompatibleWith(t, PrimitiveValue)) {
      return new TypesDomain(PrimitiveValue);
    }
    return TypesDomain.topVal;
  }

}
