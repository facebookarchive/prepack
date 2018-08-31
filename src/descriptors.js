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
  mightHaveBeenDeleted(): boolean {
    invariant(false, "should have been overridden by subclass");
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
    this.writable = desc.writable;
    this.enumerable = desc.enumerable;
    this.configurable = desc.configurable;
    this.value = desc.value;
    this.get = desc.get;
    this.set = desc.set;
  }

  throwIfNotConcrete(realm: Realm): PropertyDescriptor {
    return this;
  }
  mightHaveBeenDeleted(): boolean {
    if (this.value === undefined) return false;
    return this.value.mightHaveBeenDeleted();
  }
}

// Only internal properties (those starting with $ / where internalSlot of owning property binding is true) will ever have array values.
export class InternalSlotDescriptor extends Descriptor {
  value: void | Value | Array<any>;

  constructor(value?: void | Value | Array<any>) {
    super();
    this.value = Array.isArray(value) ? value.slice(0) : value;
  }

  mightHaveBeenDeleted(): boolean {
    return false;
  }
}

// Only used if the result of a join of two descriptors is not a data descriptor with identical attribute values.
// When present, any update to the property must produce effects that are the join of updating both descriptors,
// using joinCondition as the condition of the join.
export class AbstractJoinedDescriptor extends Descriptor {
  joinCondition: AbstractValue;
  // An undefined descriptor means it might be empty in this branch.
  descriptor1: void | Descriptor;
  descriptor2: void | Descriptor;

  constructor(joinCondition: AbstractValue, descriptor1?: Descriptor, descriptor2?: Descriptor) {
    super();
    this.joinCondition = joinCondition;
    this.descriptor1 = descriptor1;
    this.descriptor2 = descriptor2;
  }
  mightHaveBeenDeleted(): boolean {
    if (!this.descriptor1 || this.descriptor1.mightHaveBeenDeleted()) {
      return true;
    }
    if (!this.descriptor2 || this.descriptor2.mightHaveBeenDeleted()) {
      return true;
    }
    return false;
  }
}

export function cloneDescriptor(d: void | PropertyDescriptor): void | PropertyDescriptor {
  if (d === undefined) return undefined;
  return new PropertyDescriptor(d);
}

// does not check if the contents of value properties are the same
export function equalDescriptors(d1: PropertyDescriptor, d2: PropertyDescriptor): boolean {
  if (d1.writable !== d2.writable) return false;
  if (d1.enumerable !== d2.enumerable) return false;
  if (d1.configurable !== d2.configurable) return false;
  if (d1.value !== undefined) {
    if (d2.value === undefined) return false;
  }
  if (d1.get !== d2.get) return false;
  if (d1.set !== d2.set) return false;
  return true;
}
