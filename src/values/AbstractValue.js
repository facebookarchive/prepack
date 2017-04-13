/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeExpression, BabelNodeIdentifier } from "babel-types";
import type { Realm } from "../realm.js";
import type { PropertyKeyValue } from "../types.js";

import { AbstractObjectValue, BooleanValue, ConcreteValue, EmptyValue, NullValue, NumberValue, ObjectValue, StringValue, SymbolValue, UndefinedValue, Value } from "./index.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";

import * as t from "babel-types";

export type AbstractValueBuildNodeFunction = (Array<BabelNodeExpression>) => BabelNodeExpression;

export default class AbstractValue extends Value {
  constructor(
      realm: Realm,
      types: TypesDomain,
      values: ValuesDomain,
      args: Array<Value>,
      buildNode: AbstractValueBuildNodeFunction | BabelNodeExpression,
      kind?: string,
      intrinsicName?: string) {
    invariant(realm.isPartial);
    super(realm, intrinsicName);
    invariant(types.getType() !== ObjectValue || this instanceof AbstractObjectValue);
    invariant(types.getType() !== NullValue && types.getType() !== UndefinedValue);
    this.types = types;
    this.values = values;
    this._buildNode = buildNode;
    this.args = args;
    this.kind = kind;
  }

  clone(): AbstractValue {
    let result = new AbstractValue(
      this.$Realm, this.types, this.values, this.args, this._buildNode);
    if (this.args) result.args = this.args;
    if (this.kind) result.kind = this.kind;
    return result;
  }

  getType() {
    return this.types.getType();
  }

  getGenerator() {
    let realmGenerator = this.$Realm.generator;
    invariant(realmGenerator);
    return realmGenerator;
  }

  kind: ?string;
  types: TypesDomain;
  values: ValuesDomain;
  args: Array<Value>;
  _buildNode: AbstractValueBuildNodeFunction | BabelNodeExpression;

  buildNode(args: Array<BabelNodeExpression>): BabelNodeExpression {
    return this._buildNode instanceof Function
      ? ((this._buildNode: any): AbstractValueBuildNodeFunction)(args)
      : ((this._buildNode: any): BabelNodeExpression);
  }

  hasIdentifier() {
    return this._buildNode.type === "Identifier";
  }

  getIdentifier() {
    invariant(this.hasIdentifier());
    return ((this._buildNode: any): BabelNodeIdentifier);
  }

  mightBeNumber(): boolean {
    let valueType = this.getType();
    if (valueType === NumberValue) return true;
    return this.values.includesValueOfType(NumberValue);
  }

  mightNotBeNumber(): boolean {
    let valueType = this.getType();
    if (valueType === NumberValue) return false;
    return this.values.includesValueNotOfType(NumberValue);
  }

  mightNotBeObject(): boolean {
    let valueType = this.getType();
    if (valueType === ObjectValue) return false;
    return this.values.includesValueNotOfType(ObjectValue);
  }

  mightBeObject(): boolean {
    let valueType = this.getType();
    if (valueType === ObjectValue) return true;
    return this.values.includesValueOfType(ObjectValue);
  }

  mightBeUndefined(): boolean {
    let valueType = this.getType();
    if (valueType === UndefinedValue) return true;
    return this.values.includesValueOfType(UndefinedValue);
  }

  mightHaveBeenDeleted(): boolean {
    return this.values.includesValueOfType(EmptyValue);
  }

  promoteEmptyToUndefined(): Value {
    if (!this.values.includesValueOfType(EmptyValue)) return this;
    let result = this.clone();
    result.values = result.values.promoteEmptyToUndefined();
    let cond = this.$Realm.createAbstract(new TypesDomain(BooleanValue), ValuesDomain.topVal,
      [this, this.$Realm.intrinsics.empty],
      ([x, y]) => t.binaryExpression("===", x, y));
    result.args = [cond, this.$Realm.intrinsics.undefined, this];
    result._buildNode = (args) => t.conditionalExpression(args[0], args[1], args[2]);
    return result;
  }

  throwIfNotConcrete(): ConcreteValue {
    return AbstractValue.throwIntrospectionError(this);
  }

  throwIfNotConcreteNumber(): NumberValue {
    return AbstractValue.throwIntrospectionError(this);
  }

  throwIfNotConcreteObject(): ObjectValue {
    return AbstractValue.throwIntrospectionError(this);
  }

  throwIfNotObject(): AbstractObjectValue {
    invariant(!(this instanceof AbstractObjectValue));
    return AbstractValue.throwIntrospectionError(this);
  }

  static throwIntrospectionError<T>(val: Value, propertyName: void | PropertyKeyValue): T {
    let realm = val.$Realm;

    let identity;
    if (val === realm.$GlobalObject) identity = "global";
    if (!identity) identity = val.intrinsicName;
    if (!identity && val instanceof AbstractValue) identity = "(some abstract value)";
    if (!identity) identity = "(some value)";

    let location;
    if (propertyName instanceof SymbolValue) location = `at symbol [${propertyName.$Description || "(no description)"}]`;
    else if (propertyName instanceof StringValue) location = `at ${propertyName.value}`;
    else if (typeof propertyName === "string") location = `at ${propertyName}`;
    else location = "";

    let type = val instanceof AbstractValue ? "abstract value" : val instanceof ObjectValue ? `${val.isSimple() ? "simple " : " "}${val.isPartial() ? "partial " : " "}object` : "value";

    let message = `Introspection of ${identity} ${location} is not allowed on ${type}`;

    throw realm.createErrorThrowCompletion(realm.intrinsics.__IntrospectionError, message);
  }

}
