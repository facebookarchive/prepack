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
  BabelNodeLogicalOperator,
  BabelNodeSourceLocation,
  BabelUnaryOperator,
} from "@babel/types";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import { createOperationDescriptor, PreludeGenerator, type OperationDescriptor } from "../utils/generator.js";
import type { PropertyKeyValue, ShapeInformationInterface } from "../types.js";
import buildExpressionTemplate from "../utils/builder.js";

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
import { hashString, hashBinary, hashCall, hashTernary, hashUnary } from "../methods/index.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";

// In addition to the explicitly listed kinds,
// all strings that start with `AbstractValueKindPrefix` are also legal kinds.
export type AbstractValueKind =
  | "||"
  | "!"
  | "==="
  | "!=="
  | "rebuiltProperty"
  | "abstractConcreteUnion"
  | "build function"
  | "widened property"
  | "widened return result"
  | "widened numeric property"
  | "conditional"
  | "resolved"
  | "dummy parameter"
  | "explicit conversion to object"
  | "check for known property"
  | "sentinel member expression"
  | "template for property name condition"
  | "template for prototype member expression"
  | "this"
  | "this.refs"
  | "module"
  | "module.exports"
  | "JSResource"
  | "Bootloader"
  | "(A).length"
  | "(A).toString()"
  | "(A).slice(B,C)"
  | "(A).split(B,C)"
  | "global.JSON.stringify(A)"
  | "global.JSON.parse(A)"
  | "JSON.stringify(...)"
  | "JSON.parse(...)"
  | "global.Math.imul(A, B)"
  | "global.__cannotBecomeObject(A)";

// Use AbstractValue.makeKind to make a kind from one of these prefices.
type AbstractValueKindPrefix =
  | "abstract"
  | "props"
  | "context"
  | "property"
  | "process"
  | "template"
  | "abstractCounted"
  | "magicGlobalObject";

export default class AbstractValue extends Value {
  constructor(
    realm: Realm,
    types: TypesDomain,
    values: ValuesDomain,
    hashValue: number,
    args: Array<Value>,
    operationDescriptor?: OperationDescriptor,
    optionalArgs?: {| kind?: AbstractValueKind, intrinsicName?: string, shape?: ShapeInformationInterface |}
  ) {
    invariant(realm.useAbstractInterpretation);
    super(realm, optionalArgs ? optionalArgs.intrinsicName : undefined);
    invariant(!Value.isTypeCompatibleWith(types.getType(), ObjectValue) || this instanceof AbstractObjectValue);
    invariant(types.getType() !== NullValue && types.getType() !== UndefinedValue);
    this.types = types;
    this.values = values;
    this.mightBeEmpty = false;
    this.operationDescriptor = operationDescriptor;
    this.args = args;
    this.hashValue = hashValue;
    this.kind = optionalArgs ? optionalArgs.kind : undefined;
    this.shape = optionalArgs ? optionalArgs.shape : undefined;
  }

  hashValue: number;
  kind: void | AbstractValueKind;
  types: TypesDomain;
  values: ValuesDomain;
  mightBeEmpty: boolean;
  args: Array<Value>;
  shape: void | ShapeInformationInterface;
  operationDescriptor: void | OperationDescriptor;

  toDisplayString(): string {
    return "[Abstract " + this.hashValue.toString() + "]";
  }

  addSourceLocationsTo(locations: Array<BabelNodeSourceLocation>, seenValues?: Set<AbstractValue> = new Set()): void {
    if (seenValues.has(this)) return;
    seenValues.add(this);
    // TODO: make this work again?
    // if (this._buildNode && !(this._buildNode instanceof Function)) {
    //   if (this._buildNode.loc) locations.push(this._buildNode.loc);
    // }
    for (let val of this.args) {
      if (val instanceof AbstractValue) val.addSourceLocationsTo(locations, seenValues);
    }
  }

  addSourceNamesTo(names: Array<string>, visited: Set<AbstractValue> = new Set()): void {
    if (visited.has(this)) return;
    visited.add(this);
    let realm = this.$Realm;
    function add_intrinsic(name: string) {
      if (name.startsWith("_$")) {
        let temporalOperationEntryArgs = realm.derivedIds.get(name);
        invariant(temporalOperationEntryArgs !== undefined);
        add_args(temporalOperationEntryArgs.args);
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
          val.addSourceNamesTo(names, visited);
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

  equals(x: Value): boolean {
    if (x instanceof ConcreteValue) return false;
    let thisArgs = this.args;
    let n = thisArgs.length;

    let argsAreEqual = () => {
      invariant(x instanceof AbstractValue);
      let xArgs = x.args;
      let m = xArgs.length;
      invariant(n === m); // Will be true if kinds are the same. Caller should see to it.
      for (let i = 0; i < n; i++) {
        let a = thisArgs[i];
        let b = xArgs[i];
        if (!a.equals(b)) return false;
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

  getHash(): number {
    return this.hashValue;
  }

  getType(): typeof Value {
    return this.types.getType();
  }

  getIdentifier(): string {
    invariant(this.hasIdentifier());
    invariant(this.operationDescriptor !== undefined);
    let { id } = this.operationDescriptor.data;
    invariant(id !== undefined);
    return id;
  }

  hasIdentifier(): boolean {
    return this.operationDescriptor ? this.operationDescriptor.type === "IDENTIFIER" : false;
  }

  _checkAbstractValueImpliesCounter(): void {
    let realm = this.$Realm;
    let abstractValueImpliesMax = realm.abstractValueImpliesMax;
    // if abstractValueImpliesMax is 0, then the counter is disabled
    if (abstractValueImpliesMax !== 0 && realm.abstractValueImpliesCounter++ > abstractValueImpliesMax) {
      realm.abstractValueImpliesCounter = 0;
      let diagnostic = new CompilerDiagnostic(
        `the implies counter has exceeded the maximum value when trying to simplify abstract values`,
        realm.currentLocation,
        "PP0029",
        "FatalError"
      );
      realm.handleError(diagnostic);
    }
  }

  // this => val. A false value does not imply that !(this => val).
  implies(val: Value): boolean {
    this._checkAbstractValueImpliesCounter();
    if (this.equals(val)) return true; // x => x regardless of its value
    if (!this.mightNotBeFalse()) return true; // false => val
    if (!val.mightNotBeTrue()) return true; // x => true regardless of the value of x
    if (val instanceof AbstractValue) {
      // Neither this (x) nor val (y) is a known value, so we need to do some reasoning based on the structure
      // x => x || y
      if (val.kind === "||") {
        let [x, y] = val.args;
        return this.implies(x) || this.implies(y);
      }

      // x => !y if y => !x
      if (val.kind === "!") {
        let [y] = val.args;
        invariant(y instanceof AbstractValue);
        return y.impliesNot(this);
      }
      // x => x !== null && x !== undefined
      if (val.kind === "!==") {
        let [x, y] = val.args;
        if (this.implies(x)) return y instanceof NullValue || y instanceof UndefinedValue;
        if (this.implies(y)) return x instanceof NullValue || x instanceof UndefinedValue;
      }
      // !!x => y if x => y
      if (this.kind === "!") {
        let [nx] = this.args;
        invariant(nx instanceof AbstractValue);
        if (nx.kind === "!") {
          let [x] = nx.args;
          invariant(x instanceof AbstractValue);
          return x.implies(val);
        }
      }
      if (this.kind === "conditional") {
        let [c, x, y] = this.args;
        // (c ? x : y) => val if x is true and y is false and c = val
        if (!x.mightNotBeTrue() && !y.mightNotBeFalse()) {
          return c.equals(val);
        }

        // (c ? false : y) => y !== undefined && y !== null && y !== f
        if (val.kind === "!==") {
          let [vx, vy] = val.args;
          if (!x.mightNotBeFalse()) {
            if (y.implies(vx)) return vy instanceof NullValue || vy instanceof UndefinedValue;
            if (y.implies(vy)) return vx instanceof NullValue || vx instanceof UndefinedValue;
          } else if (!y.mightNotBeFalse()) {
            if (x.implies(vx)) return vy instanceof NullValue || vy instanceof UndefinedValue;
            if (x.implies(vy)) return vx instanceof NullValue || vx instanceof UndefinedValue;
          }
        }

        // (c ? x : false) => c && x (if c or x were falsy, (c ? x : false) could not be true)
        if (!y.mightNotBeFalse()) {
          if (c.implies(val)) return true;
          if (x.implies(val)) return true;
        }
      }
      // (0 !== x) => x since undefined, null, false, 0, NaN and "" are excluded by the !== and all other values are thruthy
      if (this.kind === "!==") {
        let [x, y] = this.args;
        if (x instanceof NumberValue && x.value === 0) return y.equals(val);
        if (y instanceof NumberValue && y.value === 0) return x.equals(val);
      }
      if (this.kind === "===" && val.kind === "==") {
        // x === undefined/null => y == undefined/null
        let [x, y] = val.args;
        if (
          x instanceof NullValue ||
          x instanceof UndefinedValue ||
          y instanceof NullValue ||
          y instanceof UndefinedValue
        ) {
          let [vx, vy] = val.args;
          if (
            vx instanceof NullValue ||
            vx instanceof UndefinedValue ||
            vy instanceof NullValue ||
            vy instanceof UndefinedValue
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // this => !val. A false value does not imply that !(this => !val).
  impliesNot(val: Value): boolean {
    if (this.equals(val)) return false; // x => x regardless of its value, hence x => !val is false
    if (!this.mightNotBeFalse()) return true; // false => !val
    if (!val.mightNotBeFalse()) return true; // x => !false regardless of the value of x
    if (val instanceof AbstractValue) {
      // !x => !y if y => x
      if (this.kind === "!") {
        let [x] = this.args;
        invariant(x instanceof AbstractValue);
        if (x.kind === "!") {
          // !!x => !y if y => !x
          invariant(x instanceof AbstractValue);
          let [xx] = x.args;
          invariant(xx instanceof AbstractValue);
          return xx.impliesNot(val);
        }
        if (x.kind === "abstractConcreteUnion") return false; // can't use two valued logic for this.
        return val.implies(x);
      }
      if (this.kind === "conditional") {
        let [c, x, y] = this.args;
        // (c ? x : y) => !val if x is false and y is true and c = val
        if (!x.mightNotBeFalse() && !y.mightNotBeTrue()) {
          return c.equals(val);
        }
      }
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
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightBeFalse()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.mightBeFalse();
  }

  mightNotBeFalse(): boolean {
    let valueType = this.getType();
    if (valueType === UndefinedValue) return false;
    if (valueType === NullValue) return false;
    if (valueType === SymbolValue) return true;
    if (Value.isTypeCompatibleWith(valueType, ObjectValue)) return true;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightNotBeFalse()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.mightNotBeFalse();
  }

  mightBeNull(): boolean {
    let valueType = this.getType();
    if (valueType === NullValue) return true;
    if (valueType !== PrimitiveValue && valueType !== Value) return false;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightBeNull()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.includesValueOfType(NullValue);
  }

  mightNotBeNull(): boolean {
    let valueType = this.getType();
    if (valueType === NullValue) return false;
    if (valueType !== PrimitiveValue && valueType !== Value) return true;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightNotBeNull()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.includesValueNotOfType(NullValue);
  }

  mightBeNumber(): boolean {
    let valueType = this.getType();
    if (Value.isTypeCompatibleWith(valueType, NumberValue)) return true;
    if (valueType !== PrimitiveValue && valueType !== Value) return false;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightBeNumber()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.includesValueOfType(NumberValue);
  }

  mightNotBeNumber(): boolean {
    let valueType = this.getType();
    if (Value.isTypeCompatibleWith(valueType, NumberValue)) return false;
    if (valueType !== PrimitiveValue && valueType !== Value) return true;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightNotBeNumber()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.includesValueNotOfType(NumberValue);
  }

  mightNotBeObject(): boolean {
    let valueType = this.getType();
    if (Value.isTypeCompatibleWith(valueType, PrimitiveValue)) return true;
    if (Value.isTypeCompatibleWith(valueType, ObjectValue)) return false;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightNotBeObject()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.includesValueNotOfType(ObjectValue);
  }

  mightBeObject(): boolean {
    let valueType = this.getType();
    if (Value.isTypeCompatibleWith(valueType, PrimitiveValue)) return false;
    if (Value.isTypeCompatibleWith(valueType, ObjectValue)) return true;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightBeObject()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.includesValueOfType(ObjectValue);
  }

  mightBeString(): boolean {
    let valueType = this.getType();
    if (valueType === StringValue) return true;
    if (valueType !== PrimitiveValue && valueType !== Value) return false;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightBeString()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.includesValueOfType(StringValue);
  }

  mightNotBeString(): boolean {
    let valueType = this.getType();
    if (valueType === StringValue) return false;
    if (valueType !== PrimitiveValue && valueType !== Value) return true;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightNotBeString()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.includesValueNotOfType(StringValue);
  }

  mightBeUndefined(): boolean {
    let valueType = this.getType();
    if (valueType === UndefinedValue) return true;
    if (valueType !== PrimitiveValue && valueType !== Value) return false;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightBeUndefined()) return true;
      return false;
    }
    if (this.values.isTop()) return true;
    return this.values.includesValueOfType(UndefinedValue);
  }

  mightNotBeUndefined(): boolean {
    let valueType = this.getType();
    if (valueType === UndefinedValue) return false;
    if (valueType !== PrimitiveValue && valueType !== Value) return true;
    if (this.kind === "abstractConcreteUnion") {
      for (let arg of this.args) if (arg.mightNotBeUndefined()) return true;
      return false;
    }
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
    if (result instanceof AbstractValue) result.values = this.values.promoteEmptyToUndefined();
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

  throwIfNotConcretePrimitive(): PrimitiveValue {
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
    kind?: AbstractValueKind,
    isCondition?: boolean,
    doNotSimplify?: boolean
  ): Value {
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
    let resultValues =
      kind === "template for property name condition"
        ? ValuesDomain.topVal
        : ValuesDomain.binaryOp(realm, op, leftValues, rightValues);
    let [hash, args] = kind === undefined ? hashBinary(op, left, right) : hashCall(kind, left, right);
    let operationDescriptor = createOperationDescriptor("BINARY_EXPRESSION", { op });
    let result = new AbstractValue(realm, resultTypes, resultValues, hash, args, operationDescriptor);
    result.kind = kind || op;
    result.expressionLocation = loc;
    if (doNotSimplify) return result;
    return isCondition
      ? realm.simplifyAndRefineAbstractCondition(result)
      : realm.simplifyAndRefineAbstractValue(result);
  }

  static createFromLogicalOp(
    realm: Realm,
    op: BabelNodeLogicalOperator,
    left: Value,
    right: Value,
    loc?: ?BabelNodeSourceLocation,
    isCondition?: boolean,
    doNotSimplify?: boolean
  ): Value {
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

    let resultTypes = TypesDomain.logicalOp(op, leftTypes, rightTypes);
    let resultValues = ValuesDomain.logicalOp(realm, op, leftValues, rightValues);
    let [hash, args] = hashCall(op, left, right);
    let Constructor = Value.isTypeCompatibleWith(resultTypes.getType(), ObjectValue)
      ? AbstractObjectValue
      : AbstractValue;
    let operationDescriptor = createOperationDescriptor("LOGICAL_EXPRESSION", { op });
    let result = new Constructor(realm, resultTypes, resultValues, hash, args, operationDescriptor);
    result.kind = op;
    result.expressionLocation = loc;
    if (doNotSimplify) return result;
    return isCondition
      ? realm.simplifyAndRefineAbstractCondition(result)
      : realm.simplifyAndRefineAbstractValue(result);
  }

  static createFromConditionalOp(
    realm: Realm,
    condition: Value,
    left: void | Value,
    right: void | Value,
    loc?: ?BabelNodeSourceLocation,
    isCondition?: boolean,
    doNotSimplify?: boolean
  ): Value {
    if (left === right) {
      return left || realm.intrinsics.undefined;
    }
    if (!condition.mightNotBeTrue()) return left || realm.intrinsics.undefined;
    if (!condition.mightNotBeFalse()) return right || realm.intrinsics.undefined;

    let types = TypesDomain.joinValues(left, right);
    if (types.getType() === NullValue) return realm.intrinsics.null;
    if (types.getType() === UndefinedValue) return realm.intrinsics.undefined;
    let values = ValuesDomain.joinValues(realm, left, right);
    let [hash, args] = hashTernary(condition, left || realm.intrinsics.undefined, right || realm.intrinsics.undefined);
    let Constructor = Value.isTypeCompatibleWith(types.getType(), ObjectValue) ? AbstractObjectValue : AbstractValue;
    let operationDescriptor = createOperationDescriptor("CONDITIONAL_EXPRESSION");
    let result = new Constructor(realm, types, values, hash, args, operationDescriptor, { kind: "conditional" });
    result.expressionLocation = loc;
    if (left) result.mightBeEmpty = left.mightHaveBeenDeleted();
    if (right && !result.mightBeEmpty) result.mightBeEmpty = right.mightHaveBeenDeleted();
    if (doNotSimplify || result.mightBeEmpty) return result;
    return isCondition
      ? realm.simplifyAndRefineAbstractCondition(result)
      : realm.simplifyAndRefineAbstractValue(result);
  }

  static createFromUnaryOp(
    realm: Realm,
    op: BabelUnaryOperator,
    operand: AbstractValue,
    prefix?: boolean,
    loc?: ?BabelNodeSourceLocation,
    isCondition?: boolean,
    doNotSimplify?: boolean
  ): Value {
    invariant(op !== "delete" && op !== "++" && op !== "--"); // The operation must be pure
    let resultTypes = TypesDomain.unaryOp(op, new TypesDomain(operand.getType()));
    let resultValues = ValuesDomain.unaryOp(realm, op, operand.values);
    let operationDescriptor = createOperationDescriptor("UNARY_EXPRESSION", { op, prefix });
    let result = new AbstractValue(
      realm,
      resultTypes,
      resultValues,
      hashUnary(op, operand),
      [operand],
      operationDescriptor
    );
    result.kind = op;
    result.expressionLocation = loc;
    if (doNotSimplify) return result;
    return isCondition
      ? realm.simplifyAndRefineAbstractCondition(result)
      : realm.simplifyAndRefineAbstractValue(result);
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
    kindSuffix: string,
    loc?: ?BabelNodeSourceLocation
  ): AbstractValue {
    let kind = AbstractValue.makeKind("template", kindSuffix);
    let resultTypes = new TypesDomain(resultType);
    let resultValues = ValuesDomain.topVal;
    let hash;
    [hash, operands] = hashCall(kind, ...operands);
    let Constructor = Value.isTypeCompatibleWith(resultType, ObjectValue) ? AbstractObjectValue : AbstractValue;
    let labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    invariant(labels.length >= operands.length);
    let operationDescriptor = createOperationDescriptor("ABSTRACT_FROM_TEMPLATE", { template });
    let result = new Constructor(realm, resultTypes, resultValues, hash, operands, operationDescriptor);
    result.kind = kind;
    result.expressionLocation = loc || realm.currentLocation;
    return result;
  }

  static createFromType(
    realm: Realm,
    resultType: typeof Value,
    kind?: AbstractValueKind,
    operands?: Array<Value>
  ): AbstractValue {
    let types = new TypesDomain(resultType);
    let Constructor = Value.isTypeCompatibleWith(resultType, ObjectValue) ? AbstractObjectValue : AbstractValue;
    let [hash, args] = hashCall(resultType.name + (kind || ""), ...(operands || []));
    if (resultType === ObjectValue) hash = ++realm.objectCount;
    let result = new Constructor(realm, types, ValuesDomain.topVal, hash, args);
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
    optionalArgs?: {|
      kind?: AbstractValueKind,
      isPure?: boolean,
      skipInvariant?: boolean,
      mutatesOnly?: Array<Value>,
      shape?: ShapeInformationInterface,
    |}
  ): AbstractValue {
    invariant(resultType !== UndefinedValue);
    let temp = AbstractValue.createFromTemplate(realm, template, resultType, operands, "");
    let types = temp.types;
    let values = temp.values;
    let args = temp.args;
    invariant(realm.generator !== undefined);
    invariant(temp.operationDescriptor !== undefined);
    return realm.generator.deriveAbstract(types, values, args, temp.operationDescriptor, optionalArgs);
  }

  static createFromBuildFunction(
    realm: Realm,
    resultType: typeof Value,
    args: Array<Value>,
    operationDescriptor: OperationDescriptor,
    optionalArgs?: {| kind?: AbstractValueKind |}
  ): AbstractValue | UndefinedValue {
    let types = new TypesDomain(resultType);
    let values = ValuesDomain.topVal;
    let Constructor = Value.isTypeCompatibleWith(resultType, ObjectValue) ? AbstractObjectValue : AbstractValue;
    let kind = (optionalArgs && optionalArgs.kind) || "build function";
    let hash;
    [hash, args] = hashCall(kind, ...args);
    let result = new Constructor(realm, types, values, hash, args, operationDescriptor);
    result.kind = kind;
    return result;
  }

  static createTemporalFromBuildFunction(
    realm: Realm,
    resultType: typeof Value,
    args: Array<Value>,
    operationDescriptor: OperationDescriptor,
    optionalArgs?: {|
      kind?: AbstractValueKind,
      isPure?: boolean,
      skipInvariant?: boolean,
      mutatesOnly?: Array<Value>,
      shape?: void | ShapeInformationInterface,
    |}
  ): AbstractValue | UndefinedValue {
    let types = new TypesDomain(resultType);
    let values = ValuesDomain.topVal;
    invariant(realm.generator !== undefined);
    if (resultType === UndefinedValue) {
      return realm.generator.emitVoidExpression(types, values, args, operationDescriptor);
    } else {
      return realm.generator.deriveAbstract(types, values, args, operationDescriptor, optionalArgs);
    }
  }

  // Creates a union of an abstract value with one or more concrete values.
  // The operation descriptor for the abstract values becomes the operation descriptor for the union.
  // Use this only to allow instrinsic abstract objects to be null and/or undefined.
  static createAbstractConcreteUnion(realm: Realm, ...elements: Array<Value>): AbstractValue {
    let concreteValues: Array<ConcreteValue> = (elements.filter(e => e instanceof ConcreteValue): any);
    invariant(concreteValues.length > 0 && concreteValues.length === elements.length - 1);
    let concreteSet = new Set(concreteValues);
    let abstractValue = elements.find(e => e instanceof AbstractValue);
    invariant(abstractValue instanceof AbstractValue);
    let values;
    if (!abstractValue.values.isTop()) {
      abstractValue.values.getElements().forEach(v => concreteSet.add(v));
      values = new ValuesDomain(concreteSet);
    } else {
      values = ValuesDomain.topVal;
    }
    let types = TypesDomain.topVal;
    let [hash, operands] = hashCall("abstractConcreteUnion", abstractValue, ...concreteValues);
    let result = new AbstractValue(realm, types, values, hash, operands, createOperationDescriptor("SINGLE_ARG"), {
      kind: "abstractConcreteUnion",
    });
    result.expressionLocation = realm.currentLocation;
    return result;
  }

  static createFromWidenedProperty(
    realm: Realm,
    resultTemplate: AbstractValue,
    args: Array<Value>,
    operationDescriptor: OperationDescriptor
  ): AbstractValue {
    let types = resultTemplate.types;
    let values = resultTemplate.values;
    let [hash] = hashCall("widened property", ...args);
    let Constructor = Value.isTypeCompatibleWith(types.getType(), ObjectValue) ? AbstractObjectValue : AbstractValue;
    let result = new Constructor(realm, types, values, hash, args, operationDescriptor);
    result.kind = "widened property";
    result.mightBeEmpty = resultTemplate.mightBeEmpty;
    result.expressionLocation = resultTemplate.expressionLocation;
    return result;
  }

  static createFromWidening(realm: Realm, value1: Value, value2: Value): AbstractValue {
    // todo: #1174 look at kind and figure out much narrower widenings
    let types = TypesDomain.joinValues(value1, value2);
    let values = ValuesDomain.topVal;
    let [hash] = hashCall("widened");
    let Constructor = Value.isTypeCompatibleWith(types.getType(), ObjectValue) ? AbstractObjectValue : AbstractValue;
    let result = new Constructor(realm, types, values, hash, []);
    result.kind = "widened";
    result.mightBeEmpty = value1.mightHaveBeenDeleted() || value2.mightHaveBeenDeleted();
    result.expressionLocation = value1.expressionLocation;
    return result;
  }

  static createAbstractArgument(
    realm: Realm,
    name: string,
    location: ?BabelNodeSourceLocation,
    type: typeof Value = Value,
    shape: void | ShapeInformationInterface = undefined
  ): AbstractValue {
    if (!realm.useAbstractInterpretation) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "realm is not partial");
    }

    let realmPreludeGenerator = realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    let types = new TypesDomain(type);
    let values = ValuesDomain.topVal;
    let Constructor = Value.isTypeCompatibleWith(type, ObjectValue) ? AbstractObjectValue : AbstractValue;
    let operationDescriptor = createOperationDescriptor("IDENTIFIER", { id: name });
    let result = new Constructor(realm, types, values, 943586754858 + hashString(name), [], operationDescriptor);
    result.kind = AbstractValue.makeKind("abstractCounted", (realm.objectCount++).toString()); // need not be an object, but must be unique
    result.expressionLocation = location;
    result.shape = shape;
    return result;
  }

  static generateErrorInformationForAbstractVal(val: AbstractValue): string {
    let names = [];
    val.addSourceNamesTo(names);
    return `abstract value${names.length > 1 ? "s" : ""} ${names.join(" and ")}`;
  }

  static describe(val: Value, propertyName: void | PropertyKeyValue): string {
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

    return `${identity} ${location}`;
  }

  static reportIntrospectionError(val: Value, propertyName: void | PropertyKeyValue): void {
    let message = "";
    if (!val.$Realm.suppressDiagnostics)
      message = `This operation is not yet supported on ${AbstractValue.describe(val, propertyName)}`;

    let realm = val.$Realm;
    return realm.reportIntrospectionError(message);
  }

  static createAbstractObject(realm: Realm, name: string, template?: ObjectValue): AbstractObjectValue {
    let value;
    if (template === undefined) {
      template = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
    }
    template.makePartial();
    template.makeSimple();
    value = AbstractValue.createFromTemplate(realm, buildExpressionTemplate(name), ObjectValue, [], name);
    if (!realm.isNameStringUnique(name)) {
      value.hashValue = ++realm.objectCount;
    } else {
      realm.saveNameString(name);
    }
    value.intrinsicName = name;
    value.values = new ValuesDomain(new Set([template]));
    realm.rebuildNestedProperties(value, name);
    invariant(value instanceof AbstractObjectValue);
    return value;
  }

  static makeKind(prefix: AbstractValueKindPrefix, suffix: string): AbstractValueKind {
    return ((`${prefix}:${suffix}`: any): AbstractValueKind);
  }

  static createTemporalObjectAssign(
    realm: Realm,
    to: ObjectValue | AbstractObjectValue,
    sources: Array<Value>
  ): AbstractObjectValue {
    // Tell serializer that it may add properties to to only after temporalTo has been emitted
    let temporalArgs = [to, ...sources];
    let preludeGenerator = realm.preludeGenerator;
    invariant(preludeGenerator !== undefined);
    let temporalTo = AbstractValue.createTemporalFromBuildFunction(
      realm,
      ObjectValue,
      temporalArgs,
      createOperationDescriptor("OBJECT_ASSIGN"),
      { skipInvariant: true, mutatesOnly: [to] }
    );
    invariant(temporalTo instanceof AbstractObjectValue);
    if (to instanceof AbstractObjectValue) {
      temporalTo.values = to.values;
    } else {
      invariant(to instanceof ObjectValue);
      temporalTo.values = new ValuesDomain(to);
    }
    to.temporalAlias = temporalTo;
    return temporalTo;
  }
}
