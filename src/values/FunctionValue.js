/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { PathConditions, ObjectKind } from "../types.js";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";
import { ObjectValue, NumberValue } from "./index.js";
import invariant from "../invariant.js";

/* Abstract base class for all function objects */
export default class FunctionValue extends ObjectValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, realm.intrinsics.FunctionPrototype, intrinsicName);
  }

  pathConditionDuringDeclaration: PathConditions | void;
  $Environment: LexicalEnvironment;
  $InnerEnvironment: LexicalEnvironment;
  $ScriptOrModule: any;

  // Indicates whether this function has been referenced by a __residual call.
  // If true, the serializer will check that the function does not access any
  // identifiers defined outside of the local scope.
  isResidual: void | true;

  // Allows for residual function with inference of parameters
  isUnsafeResidual: void | true;

  getName(): string {
    throw new Error("Abstract method");
  }

  getKind(): ObjectKind {
    return "Function";
  }

  getLength(): void | number {
    let binding = this.properties.get("length");
    invariant(binding);
    let desc = binding.descriptor;
    invariant(desc);
    let value = desc.throwIfNotConcrete(this.$Realm).value;
    if (!(value instanceof NumberValue)) return undefined;
    return value.value;
  }

  hasDefaultLength(): boolean {
    invariant(false, "abstract method; please override");
  }

  getDebugName(): string {
    return super.getDebugName() || this.getName();
  }
}
