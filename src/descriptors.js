/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "./invariant.js";
import type { AbstractValue, UndefinedValue, Value } from "./values/index.js";
import { CompilerDiagnostic, FatalError } from "./errors.js";
import type { CallableObjectValue } from "./types.js";
import type { Realm } from "./realm.js";

export class Descriptor {
  constructor() {
    invariant(this.constructor !== Descriptor, "Descriptor is an abstract base class");
  }
  throwIfNotConcrete(realm: Realm): PropertyDescriptor {
    let error = new CompilerDiagnostic(
      "only known descriptors supported",
      realm.currentLocation,
      "PP0042",
      "FatalError"
    );
    realm.handleError(error);
    throw new FatalError();
  }
}

export type DescriptorInitializer = {|
  writable?: boolean,
  enumerable?: boolean,
  configurable?: boolean,

  value?: Value,

  get?: UndefinedValue | CallableObjectValue | AbstractValue,
  set?: UndefinedValue | CallableObjectValue | AbstractValue,
|};

// Normal descriptors are returned just like spec descriptors
export class PropertyDescriptor extends Descriptor {
  writable: void | boolean;
  enumerable: void | boolean;
  configurable: void | boolean;

  // If value instanceof EmptyValue, then this descriptor indicates that the
  // corresponding property has been deleted.
  value: void | Value;

  get: void | UndefinedValue | CallableObjectValue | AbstractValue;
  set: void | UndefinedValue | CallableObjectValue | AbstractValue;

  constructor(desc: DescriptorInitializer | PropertyDescriptor) {
    super();
    if (desc.hasOwnProperty("writable")) this.writable = desc.writable;
    if (desc.hasOwnProperty("enumerable")) this.enumerable = desc.enumerable;
    if (desc.hasOwnProperty("configurable")) this.configurable = desc.configurable;
    if (desc.hasOwnProperty("value")) this.value = desc.value;
    if (desc.hasOwnProperty("get")) this.get = desc.get;
    if (desc.hasOwnProperty("set")) this.set = desc.set;
  }

  throwIfNotConcrete(realm: Realm): PropertyDescriptor {
    return this;
  }
}

// Only internal properties (those starting with $ / where internalSlot of owning property binding is true) will ever have array values.
export class InternalSlotDescriptor extends Descriptor {
  value: void | Value | Array<any>;

  constructor(value?: void | Value | Array<any>) {
    super();
    this.value = Array.isArray(value) ? value.slice(0) : value;
  }
}

// Only used if the result of a join of two descriptors is not a data descriptor with identical attribute values.
// When present, any update to the property must produce effects that are the join of updating both desriptors,
// using joinCondition as the condition of the join.
export class AbstractJoinedDescriptor extends Descriptor {
  joinCondition: AbstractValue;
  descriptor1: void | Descriptor;
  descriptor2: void | Descriptor;

  constructor(joinCondition: AbstractValue, descriptor1?: Descriptor, descriptor2?: Descriptor) {
    super();
    this.joinCondition = joinCondition;
    this.descriptor1 = descriptor1;
    this.descriptor2 = descriptor2;
  }
}
