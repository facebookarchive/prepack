/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type {
  BabelBinaryOperator,
  BabelNodeExpression,
  BabelNodeIdentifier,
  BabelNodeLogicalOperator,
  BabelNodeSourceLocation,
  BabelUnaryOperator,
} from "babel-types";
import { FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import type { PropertyKeyValue } from "../types.js";
import { PreludeGenerator } from "../utils/generator.js";

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
import {
  hashBinary,
  hashCall,
  hashString,
  hashTernary,
  hashUnary,
  StrictEqualityComparison,
  ToBoolean,
} from "../methods/index.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";

import * as t from "babel-types";

export type AbstractValueBuildNodeFunction = (Array<BabelNodeExpression>) => BabelNodeExpression;

export default class AbstractValue extends Value {
  constructor(
    realm: Realm,
    types: TypesDomain,
    values: ValuesDomain,
    hashValue: number,
    args: Array<Value>,
    buildNode?: AbstractValueBuildNodeFunction | BabelNodeExpression,
    optionalArgs?: {| kind?: string, intrinsicName?: string |}
  ) {
    invariant(realm.useAbstractInterpretation);
    super(realm, optionalArgs ? optionalArgs.intrinsicName : undefined);
    invariant(buildNode instanceof Function || args.length === 0);
    invariant(!Value.isTypeCompatibleWith(types.getType(), ObjectValue) || this instanceof AbstractObjectValue);
    invariant(types.getType() !== NullValue && types.getType() !== UndefinedValue);
    this.types = types;
    this.values = values;
    this.mightBeEmpty = false;
    this._buildNode = buildNode;
    this.args = args;
    this.hashValue = hashValue;
    this.kind = optionalArgs ? optionalArgs.kind : undefined;
  }

  hashValue: number;
  kind: ?string;
  types: TypesDomain;
  values: ValuesDomain;
  mightBeEmpty: boolean;
  args: Array<Value>;
  _buildNode: void | AbstractValueBuildNodeFunction | BabelNodeExpression;

  addSourceLocationsTo(locations: Array<BabelNodeSourceLocation>, seenValues?: Set<AbstractValue> = new Set()) {
    if (seenValues.has(this)) return;
    seenValues.add(this);
    if (this._buildNode && !(this._buildNode instanceof Function)) {
      if (this._buildNode.loc) locations.push(this._buildNode.loc);
    }
    for (let val of this.args) {
      if (val instanceof AbstractValue) val.addSourceLocationsTo(locations, seenValues);
    }
  }

  addSourceNamesTo(names: Array<string>) {
    let gen = this.$Realm.preludeGenerator;
    function add_intrinsic(name: string) {
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
          add_intrinsic(val.intrinsicName);
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
      add_intrinsic(this.intrinsicName);
    }
    add_args(this.args);
  }

  buildNode(args: Array<BabelNodeExpression>): BabelNodeExpression {
    let buildNode = this.getBuildNode();
    return buildNode instanceof Function
      ? ((buildNode: any): AbstractValueBuildNodeFunction)(args)
      : ((buildNode: any): BabelNodeExpression);
  }

  equals(x: Value) {
    if (x instanceof ConcreteValue) return false;
    let thisArgs = this.args;
    let n = thisArgs.length;

    let argsAreEqual = () => {
      invariant(x instanceof AbstractValue);
      let xArgs = x.args;
      let m = xArgs.length;
      if (n !== m) return false;
      for (let i = 0; i < n; i++) {
        let a = thisArgs[i];
        let b = xArgs[i];
        if (a instanceof AbstractValue) {
          if (a.equals(b)) continue;
          else return false;
        } else {
          invariant(a instanceof ConcreteValue);
          if (b instanceof ConcreteValue) return StrictEqualityComparison(this.$Realm, a, b);
          invariant(b instanceof AbstractValue);
          return b.equals(a);
        }
      }
      return true;
    };

    return (
      this === x ||
      (x instanceof AbstractValue &&
        this.kind === x.kind &&
        this.hashValue === x.hashValue &&
        ((this.intrinsicName && this.intrinsicName.length > 0 && this.intrinsicName === x.intrinsicName) ||
          (n > 0 && argsAreEqual())))
    );
  }

  getBuildNode(): AbstractValueBuildNodeFunction | BabelNodeExpression {
    invariant(this._buildNode);
    return this._buildNode;
  }

  getHash(): number {
    return this.hashValue;
  }

  getType() {
    return this.types.getType();
  }

  getIdentifier() {
    invariant(this.hasIdentifier());
    return ((this._buildNode: any): BabelNodeIdentifier);
  }

  hasIdentifier() {
    return this._buildNode && this._buildNode.type === "Identifier";
  }

  implies(val: AbstractValue): boolean {
    // Neither this nor val is a known value, so we need to some reasoning based on the structure
    if (this.equals(val)) return true; // x => x regardless of its value
    // (x && y) => z if (x => z) || (y => z)
    if (this.kind === "&&") {
      let [x, y] = this.args;
      invariant(x instanceof AbstractValue);
      invariant(y instanceof AbstractValue);
      return x.implies(val) || y.implies(val);
    }
    // (x || y) => z if (x => z) && (y => z)
    if (this.kind === "||") {
      let [x, y] = this.args;
      invariant(x instanceof AbstractValue);
      invariant(y instanceof AbstractValue);
      return x.implies(val) && y.implies(val);
    }
    // x => (y && z) if (x => y) && (x = z)
    if (val.kind === "&&") {
      let [y, z] = this.args;
      invariant(y instanceof AbstractValue);
      invariant(z instanceof AbstractValue);
      return this.implies(y) && this.implies(z);
    }
    // x => (y || z) if (x => y) || (x = z)
    if (val.kind === "||") {
      let [y, z] = this.args;
      invariant(y instanceof AbstractValue);
      invariant(z instanceof AbstractValue);
      return this.implies(y) || this.implies(z);
    }
    return false;
  }

  // todo: abstract values should never be of type UndefinedValue or NullValue, assert this
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

  mightNotBeNull(): boolean {
    let valueType = this.getType();
    if (valueType === NullValue) return false;
    if (valueType !== Value) return true;
    if (this.values.isTop()) return true;
    return this.values.includesValueNotOfType(NullValue);
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

  mightBeString(): boolean {
    let valueType = this.getType();
    if (valueType === StringValue) return true;
    if (valueType !== Value) return false;
    if (this.values.isTop()) return true;
    return this.values.includesValueOfType(StringValue);
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

  mightNotBeUndefined(): boolean {
    let valueType = this.getType();
    if (valueType === UndefinedValue) return false;
    if (valueType !== Value) return true;
    if (this.values.isTop()) return true;
    return this.values.includesValueNotOfType(UndefinedValue);
  }

  mightHaveBeenDeleted(): boolean {
    return this.mightBeEmpty;
  }

  promoteEmptyToUndefined(): Value {
    if (this.values.isTop()) return this;
    if (!this.mightBeEmpty) return this;
    let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, this.$Realm.intrinsics.empty);
    let result = AbstractValue.createFromConditionalOp(this.$Realm, cond, this.$Realm.intrinsics.undefined, this);
    result.values = this.values.promoteEmptyToUndefined();
    return result;
  }

  refineWithPathCondition(): Value {
    function pathImplies(condition: AbstractValue): boolean {
      let path = condition.$Realm.pathConditions;
      for (let i = path.length - 1; i >= 0; i--) {
        let pathCondition = path[i];
        if (pathCondition.implies(condition)) return true;
      }
      return false;
    }

    let realm = this.$Realm;
    let op = this.kind;
    let result = (() => {
      if (op === "&&" || op === "||") {
        let [left, right] = this.args;
        let refinedLeft = left instanceof AbstractValue ? left.refineWithPathCondition() : left;
        let refinedRight = right instanceof AbstractValue ? right.refineWithPathCondition() : right;
        if (left === refinedLeft && right === refinedRight) return this;
        return AbstractValue.createFromLogicalOp(realm, op, refinedLeft, refinedRight, this.expressionLocation);
      }
      if (op === "!") {
        let arg = this.args[0];
        let refinedArg = arg instanceof AbstractValue ? arg.refineWithPathCondition() : arg;
        if (arg === refinedArg) return this;
        if (!refinedArg.mightNotBeTrue()) return realm.intrinsics.false;
        if (!refinedArg.mightNotBeFalse()) return realm.intrinsics.true;
        invariant(refinedArg instanceof AbstractValue); // concrete values always make up their mind above
        return AbstractValue.createFromUnaryOp(realm, op, refinedArg);
      }
      if (op !== "conditional") return this;
      let [condition, trueVal, falseVal] = this.args;
      invariant(trueVal !== undefined);
      invariant(falseVal !== undefined);
      invariant(condition instanceof AbstractValue);
      let inverseCondition = AbstractValue.createFromUnaryOp(this.$Realm, "!", condition);
      if (pathImplies(condition)) return trueVal;
      if (pathImplies(inverseCondition)) return falseVal;
      if (pathImplies(AbstractValue.createFromBinaryOp(realm, "===", this, trueVal))) return trueVal;
      if (pathImplies(AbstractValue.createFromBinaryOp(realm, "!==", this, trueVal))) return falseVal;
      if (pathImplies(AbstractValue.createFromBinaryOp(realm, "!==", this, falseVal))) return trueVal;
      if (pathImplies(AbstractValue.createFromBinaryOp(realm, "===", this, falseVal))) return falseVal;
      return this;
    })();
    if (result !== this && result instanceof AbstractValue) return result.refineWithPathCondition();
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

  throwIfNotConcreteString(): StringValue {
    AbstractValue.reportIntrospectionError(this);
    throw new FatalError();
  }

  throwIfNotConcreteBoolean(): BooleanValue {
    AbstractValue.reportIntrospectionError(this);
    throw new FatalError();
  }

  throwIfNotConcreteSymbol(): SymbolValue {
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

  static createFromBinaryOp(
    realm: Realm,
    op: BabelBinaryOperator,
    left: Value,
    right: Value,
    loc?: ?BabelNodeSourceLocation,
    kind?: string
  ): AbstractValue {
    let leftTypes, leftValues;
    if (left instanceof AbstractValue) {
      leftTypes = left.types;
      leftValues = left.values;
    } else {
      leftTypes = new TypesDomain(left.getType());
      invariant(left instanceof ConcreteValue);
      leftValues = new ValuesDomain(left);
    }

    let rightTypes, rightValues;
    if (right instanceof AbstractValue) {
      rightTypes = right.types;
      rightValues = right.values;
    } else {
      rightTypes = new TypesDomain(right.getType());
      invariant(right instanceof ConcreteValue);
      rightValues = new ValuesDomain(right);
    }

    let resultTypes = TypesDomain.binaryOp(op, leftTypes, rightTypes);
    let resultValues = ValuesDomain.binaryOp(realm, op, leftValues, rightValues);
    let [hash, args] = kind === undefined ? hashBinary(op, left, right) : hashCall(kind, left, right);
    let result = new AbstractValue(realm, resultTypes, resultValues, hash, args, ([x, y]) =>
      t.binaryExpression(op, x, y)
    );
    result.kind = kind || op;
    result.expressionLocation = loc;
    return result;
  }

  static createFromLogicalOp(
    realm: Realm,
    op: BabelNodeLogicalOperator,
    left: Value,
    right: Value,
    loc?: ?BabelNodeSourceLocation
  ): Value {
    let leftTypes, leftValues;
    if (left instanceof AbstractValue) {
      if (!left.isIntrinsic()) {
        if (!left.mightNotBeTrue()) return op === "&&" ? right : left;
        if (!left.mightNotBeFalse()) return op === "&&" ? left : right;
      }
      leftTypes = left.types;
      leftValues = left.values;
    } else {
      invariant(left instanceof ConcreteValue);
      if (ToBoolean(realm, left)) return op === "&&" ? right : left;
      else return this.kind === "&&" ? left : right;
    }

    let rightTypes, rightValues;
    if (right instanceof AbstractValue) {
      rightTypes = right.types;
      rightValues = right.values;
    } else {
      rightTypes = new TypesDomain(right.getType());
      invariant(right instanceof ConcreteValue);
      rightValues = new ValuesDomain(right);
    }

    let resultTypes = TypesDomain.logicalOp(op, leftTypes, rightTypes);
    let resultValues = ValuesDomain.logicalOp(realm, op, leftValues, rightValues);
    let [hash, args] = hashCall(op, left, right);
    let Constructor = Value.isTypeCompatibleWith(resultTypes.getType(), ObjectValue)
      ? AbstractObjectValue
      : AbstractValue;
    let result = new Constructor(realm, resultTypes, resultValues, hash, args, ([x, y]) =>
      t.logicalExpression(op, x, y)
    );
    result.kind = op;
    result.expressionLocation = loc;
    return result;
  }

  static createFromConditionalOp(
    realm: Realm,
    condition: AbstractValue,
    left: void | Value,
    right: void | Value,
    loc?: ?BabelNodeSourceLocation
  ): AbstractValue {
    if (
      left !== undefined &&
      left.getType() === BooleanValue &&
      right !== undefined &&
      right.getType() === BooleanValue
    ) {
      if (!left.mightNotBeTrue() && !right.mightNotBeFalse()) return condition;
      if (!left.mightNotBeFalse() && !right.mightNotBeTrue())
        return AbstractValue.createFromUnaryOp(realm, "!", condition, true, loc);
    }
    let types = TypesDomain.joinValues(left, right);
    let values = ValuesDomain.joinValues(realm, left, right);
    let [hash, args] = hashTernary(condition, left || realm.intrinsics.undefined, right || realm.intrinsics.undefined);
    let Constructor = Value.isTypeCompatibleWith(types.getType(), ObjectValue) ? AbstractObjectValue : AbstractValue;
    let result = new Constructor(realm, types, values, hash, args, ([c, x, y]) => t.conditionalExpression(c, x, y), {
      kind: "conditional",
    });
    result.expressionLocation = loc;
    return result;
  }

  static createFromUnaryOp(
    realm: Realm,
    op: BabelUnaryOperator,
    operand: AbstractValue,
    prefix?: boolean,
    loc?: ?BabelNodeSourceLocation
  ): AbstractValue {
    let resultTypes = TypesDomain.unaryOp(op);
    let resultValues = ValuesDomain.unaryOp(realm, op, operand.values);
    let result = new AbstractValue(realm, resultTypes, resultValues, hashUnary(op, operand), [operand], ([x]) =>
      t.unaryExpression(op, x, prefix)
    );
    result.kind = op;
    result.expressionLocation = loc;
    return result;
  }

  /* Note that the template is parameterized by the names A, B, C and so on.
     When the abstract value is serialized, the serialized operations are substituted
     for the corresponding parameters and the resulting template is parsed into an AST subtree
     that is incorporated into the AST produced by the serializer. */
  static createFromTemplate(
    realm: Realm,
    template: PreludeGenerator => ({}) => BabelNodeExpression,
    resultType: typeof Value,
    operands: Array<Value>,
    kind: string,
    loc?: ?BabelNodeSourceLocation
  ): AbstractValue {
    let resultTypes = new TypesDomain(resultType);
    let resultValues = ValuesDomain.topVal;
    let hash;
    [hash, operands] = hashCall(kind, ...operands);
    let Constructor = Value.isTypeCompatibleWith(resultType, ObjectValue) ? AbstractObjectValue : AbstractValue;
    let labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    invariant(labels.length >= operands.length);
    let result = new Constructor(realm, resultTypes, resultValues, hash, operands, args => {
      invariant(realm.preludeGenerator !== undefined);
      let generatorArgs = {};
      let i = 0;
      for (let arg of args) generatorArgs[labels.charAt(i++)] = arg;
      return template(realm.preludeGenerator)(generatorArgs);
    });
    result.kind = kind;
    result.expressionLocation = loc || realm.currentLocation;
    return result;
  }

  static createFromType(realm: Realm, resultType: typeof Value, kind?: string): AbstractValue {
    let types = new TypesDomain(resultType);
    let Constructor = Value.isTypeCompatibleWith(resultType, ObjectValue) ? AbstractObjectValue : AbstractValue;
    let hash = hashString(resultType.name + (kind || ""));
    let result = new Constructor(realm, types, ValuesDomain.topVal, hash, []);
    if (kind) result.kind = kind;
    result.expressionLocation = realm.currentLocation;
    return result;
  }

  /* Emits a declaration for an identifier into the generator at the current point in time
     and initializes it with an expression constructed from the given template.
     Returns an abstract value that refers to the newly declared identifier.
     Note that the template must generate an expression which has no side-effects
     on the prepack state. It is assumed, however, that there could be side-effects
     on the native state unless the isPure option is specified.  */
  static createTemporalFromTemplate(
    realm: Realm,
    template: PreludeGenerator => ({}) => BabelNodeExpression,
    resultType: typeof Value,
    operands: Array<Value>,
    optionalArgs?: {| kind?: string, isPure?: boolean, skipInvariant?: boolean |}
  ): AbstractValue {
    invariant(resultType !== UndefinedValue);
    let temp = AbstractValue.createFromTemplate(realm, template, resultType, operands, "");
    let types = temp.types;
    let values = temp.values;
    let args = temp.args;
    let buildNode_ = temp.getBuildNode();
    invariant(realm.generator !== undefined);
    return realm.generator.derive(types, values, args, buildNode_, optionalArgs);
  }

  static createTemporalFromBuildFunction(
    realm: Realm,
    resultType: typeof Value,
    args: Array<Value>,
    buildFunction: AbstractValueBuildNodeFunction
  ): AbstractValue | UndefinedValue {
    let types = new TypesDomain(resultType);
    let values = ValuesDomain.topVal;
    invariant(realm.generator !== undefined);
    if (resultType === UndefinedValue) {
      return realm.generator.emitVoidExpression(types, values, args, buildFunction);
    } else {
      return realm.generator.derive(types, values, args, buildFunction);
    }
  }

  static generateErrorInformationForAbstractVal(val: AbstractValue): string {
    let names = [];
    val.addSourceNamesTo(names);
    if (names.length === 0) {
      val.addSourceNamesTo(names);
    }
    return `abstract value${names.length > 1 ? "s" : ""} ${names.join(" and ")}`;
  }

  static reportIntrospectionError(val: Value, propertyName: void | PropertyKeyValue) {
    let realm = val.$Realm;

    let identity;
    if (val === realm.$GlobalObject) identity = "global";
    else if (val instanceof AbstractValue) {
      identity = this.generateErrorInformationForAbstractVal(val);
    } else identity = val.intrinsicName || "(some value)";

    let source_locations = [];
    if (val instanceof AbstractValue) val.addSourceLocationsTo(source_locations);

    let location;
    if (propertyName instanceof SymbolValue) {
      let desc = propertyName.$Description;
      if (desc) {
        location = `at symbol [${desc.throwIfNotConcreteString().value}]`;
      } else {
        location = `at symbol [${"(no description)"}]`;
      }
    } else if (propertyName instanceof StringValue) location = `at ${propertyName.value}`;
    else if (typeof propertyName === "string") location = `at ${propertyName}`;
    else location = source_locations.length === 0 ? "" : `at ${source_locations.join("\n")}`;

    let message = `This operation is not yet supported on ${identity} ${location}`;

    return realm.reportIntrospectionError(message);
  }
}
