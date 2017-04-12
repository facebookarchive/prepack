/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { FunctionValue, Value } from "../values/index.js";
import type { BabelNodeExpression, BabelNodeStatement } from "babel-types";
import { Completion } from "../completions.js";

export type TryQuery<T> = (f: () => T, onCompletion: T | (Completion => T), logCompletion: boolean) => T;

export type FunctionInstance = {
  serializedBindings: SerializedBindings;
  functionValue: FunctionValue;
  bodyReference?: BodyReference;
};

export type Names = { [key: string]: true };
export type FunctionInfo = {
  names: Names;
  modified: Names;
  instances: Array<FunctionInstance>;
  usesArguments: boolean;
  usesThis: boolean;
}

export type SerializedBindings = { [key: string]: SerializedBinding };
export type SerializedBinding = {
  serializedValue: BabelNodeExpression;
  value?: Value;
  referentialized?: boolean;
  modified?: boolean;
}

export function AreSameSerializedBindings(x: SerializedBinding, y: SerializedBinding) {
  if (x.serializedValue === y.serializedValue) return true;
  if (x.value && x.value === y.value) return true;
  return false;
}

export class BodyReference {
  constructor(body: Array<BabelNodeStatement>, index: number) {
    this.body = body;
    this.index = index;
  }
  body: Array<BabelNodeStatement>;
  index: number;
}

export type SerializerOptions = {
  initializeMoreModules?: boolean;
  internalDebug?: boolean;
  trace?: boolean;
}
