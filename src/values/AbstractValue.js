/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeExpression, BabelNodeIdentifier, BabelNodeSourceLocation } from "babel-types";
import { FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import type { PropertyKeyValue } from "../types.js";

import {
  AbstractObjectValue,
  BooleanValue,
  ConcreteValue,
  NullValue,
  NumberValue,
  ObjectValue,
  PrimitiveValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "./index.js";
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
    optionalArgs?: {| kind?: string, intrinsicName?: string, isPure?: boolean |}
  ) {
    invariant(realm.useAbstractInterpretation);
    super(realm, optionalArgs ? optionalArgs.intrinsicName : undefined);
    invariant(!Value.isTypeCompatibleWith(types.getType(), ObjectValue) || this instanceof AbstractObjectValue);
    invariant(types.getType() !== NullValue && types.getType() !== UndefinedValue);
    this.types = types;
    this.values = values;
    this.mightBeEmpty = false;
    this._buildNode = buildNode;
    this.args = args;
    this.kind = optionalArgs ? optionalArgs.kind : undefined;
  }

  clone(): AbstractValue {
    let result = new AbstractValue(this.$Realm, this.types, this.values, this.args, this._buildNode);
    if (this.mightBeEmpty) result.mightBeEmpty = true;
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
  mightBeEmpty: boolean;
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

  addSourceLocationsTo(locations: Array<BabelNodeSourceLocation>) {
    if (!(this._buildNode instanceof Function)) {
      if (this._buildNode.loc) locations.push(this._buildNode.loc);
    }
    for (let val of this.args) {
      if (val instanceof AbstractValue) val.addSourceLocationsTo(locations);
    }
  }

  addSourceNamesTo(names: Array<string>) {
    let gen = this.$Realm.preludeGenerator;
    function add_instrinsic(name: string) {
      if (name.startsWith("_$")) {
        if (gen === undefined) return;
        add_args(gen.derivedIds.get(name));
      } else if (names.indexOf(name) < 0) {
        names.push(name);
      }
    }
    function add_args(args: void | Array<Value>) {
      if (args === undefined) return;
      for (let val of args) {
        if (val.intrinsicName) {
          add_instrinsic(val.intrinsicName);
        } else if (val instanceof AbstractValue) {
          val.addSourceNamesTo(names);
        } else if (val instanceof StringValue) {
          if (val.value.startsWith("__")) {
            names.push(val.value.slice(2));
          }
        }
      }
    }
    if (this.intrinsicName) {
      add_instrinsic(this.intrinsicName);
    }
    add_args(this.args);
  }

  mightBeFalse(): boolean {
    let valueType = this.getType();
    if (valueType === UndefinedValue) return true;
    if (valueType === NullValue) return true;
    if (valueType === SymbolValue) return false;
    if (Value.isTypeCompatibleWith(valueType, ObjectValue)) return false;
    if (this.values.isTop()) return true;
    return this.values.mightBeFalse();
  }

  mightNotBeFalse(): boolean {
    let valueType = this.getType();
    if (valueType === UndefinedValue) return false;
    if (valueType === NullValue) return false;
    if (valueType === SymbolValue) return true;
    if (Value.isTypeCompatibleWith(valueType, ObjectValue)) return true;
    if (this.values.isTop()) return true;
    return this.values.mightNotBeFalse();
  }

  mightBeNull(): boolean {
    let valueType = this.getType();
    if (valueType === NullValue) return true;
    if (valueType !== Value) return false;
    if (this.values.isTop()) return true;
    return this.values.includesValueOfType(NullValue);
  }

  mightBeNumber(): boolean {
    let valueType = this.getType();
    if (valueType === NumberValue) return true;
    if (valueType !== Value) return false;
    if (this.values.isTop()) return true;
    return this.values.includesValueOfType(NumberValue);
  }

  mightNotBeNumber(): boolean {
    let valueType = this.getType();
    if (valueType === NumberValue) return false;
    if (valueType !== Value) return true;
    if (this.values.isTop()) return true;
    return this.values.includesValueNotOfType(NumberValue);
  }

  mightNotBeObject(): boolean {
    let valueType = this.getType();
    if (Value.isTypeCompatibleWith(valueType, PrimitiveValue)) return true;
    if (Value.isTypeCompatibleWith(valueType, ObjectValue)) return false;
    if (this.values.isTop()) return true;
    return this.values.includesValueNotOfType(ObjectValue);
  }

  mightBeObject(): boolean {
    let valueType = this.getType();
    if (Value.isTypeCompatibleWith(valueType, PrimitiveValue)) return false;
    if (Value.isTypeCompatibleWith(valueType, ObjectValue)) return true;
    if (this.values.isTop()) return true;
    return this.values.includesValueOfType(ObjectValue);
  }

  mightNotBeString(): boolean {
    let valueType = this.getType();
    if (valueType === StringValue) return false;
    if (valueType !== Value) return true;
    if (this.values.isTop()) return true;
    return this.values.includesValueNotOfType(StringValue);
  }

  mightBeUndefined(): boolean {
    let valueType = this.getType();
    if (valueType === UndefinedValue) return true;
    if (valueType !== Value) return false;
    if (this.values.isTop()) return true;
    return this.values.includesValueOfType(UndefinedValue);
  }

  mightHaveBeenDeleted(): boolean {
    return this.mightBeEmpty;
  }

  promoteEmptyToUndefined(): Value {
    if (this.values.isTop()) return this;
    if (!this.mightBeEmpty) return this;
    let result = this.clone();
    result.mightBeEmpty = false;
    result.values = result.values.promoteEmptyToUndefined();
    let cond = this.$Realm.createAbstract(
      new TypesDomain(BooleanValue),
      ValuesDomain.topVal,
      [this, this.$Realm.intrinsics.empty],
      ([x, y]) => t.binaryExpression("===", x, y)
    );
    result.args = [cond, this.$Realm.intrinsics.undefined, this];
    result._buildNode = args => t.conditionalExpression(args[0], args[1], args[2]);
    return result;
  }

  throwIfNotConcrete(): ConcreteValue {
    AbstractValue.reportIntrospectionError(this);
    throw new FatalError();
  }

  throwIfNotConcreteNumber(): NumberValue {
    AbstractValue.reportIntrospectionError(this);
    throw new FatalError();
  }

  throwIfNotConcreteObject(): ObjectValue {
    AbstractValue.reportIntrospectionError(this);
    throw new FatalError();
  }

  throwIfNotObject(): AbstractObjectValue {
    invariant(!(this instanceof AbstractObjectValue));
    AbstractValue.reportIntrospectionError(this);
    throw new FatalError();
  }

  static reportIntrospectionError(val: Value, propertyName: void | PropertyKeyValue) {
    let realm = val.$Realm;

    let identity;
    if (val === realm.$GlobalObject) identity = "global";
    else if (val instanceof AbstractValue) {
      let names = [];
      val.addSourceNamesTo(names);
      if (names.length === 0) {
        val.addSourceNamesTo(names);
      }
      identity = `abstract value${names.length > 1 ? "s" : ""} ${names.join(" and ")}`;
    } else identity = val.intrinsicName || "(some value)";

    let source_locations = [];
    if (val instanceof AbstractValue) val.addSourceLocationsTo(source_locations);

    let location;
    if (propertyName instanceof SymbolValue)
      location = `at symbol [${propertyName.$Description || "(no description)"}]`;
    else if (propertyName instanceof StringValue) location = `at ${propertyName.value}`;
    else if (typeof propertyName === "string") location = `at ${propertyName}`;
    else location = source_locations.length === 0 ? "" : `at ${source_locations.join("\n")}`;

    let message = `This operation is not yet supported on ${identity} ${location}`;

    return realm.reportIntrospectionError(message);
  }
}
