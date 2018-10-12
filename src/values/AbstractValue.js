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
  BabelLogicalOperator,
  BabelNodeSourceLocation,
  BabelUnaryOperator,
} from "@babel/types";
import { Completion, JoinedAbruptCompletions, JoinedNormalAndAbruptCompletions } from "../completions.js";
import { FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import { createOperationDescriptor, type OperationDescriptor } from "../utils/generator.js";
import type { PropertyKeyValue, ShapeInformationInterface } from "../types.js";
import { Placeholders } from "../utils/PreludeGenerator.js";
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
  EmptyValue,
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
  | "mayAliasSet"
  | "build function"
  | "widened property"
  | "widened numeric property"
  | "conditional"
  | "resolved"
  | "dummy parameter"
  | "explicit conversion to object"
  | "check for known property"
  | "sentinel member expression"
  | "environment initialization expression"
  | "template for property name condition"
  | "template for prototype member expression"
  | "this"
  | "this.refs"
  | "module"
  | "module.exports"
  | "JSResource"
  | "Bootloader"
  | "(A).length"
  | "('' + A)"
  | "(A).slice(B,C)"
  | "(A).split(B,C)"
  | "global.JSON.stringify(A)"
  | "global.JSON.parse(A)"
  | "JSON.stringify(...)"
  | "JSON.parse(...)"
  | "global.Math.imul(A, B)"
  | "global.__cannotBecomeObject(A)"
  | "leaked binding value";

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
    realm.recordNewAbstract(this);
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

  // this => val. A false value does not imply that !(this => val).
  implies(val: AbstractValue, depth: number = 0): boolean {
    if (depth > 5) return false;
    if (this.equals(val)) return true; // x => x regardless of its value
    if (this.kind === "||") {
      let [x, y] = this.args;
      let xi =
        x.implies(val, depth + 1) ||
        (x instanceof AbstractValue && this.$Realm.pathConditions.impliesNot(x, depth + 1));
      if (!xi) return false;
      let yi =
        y.implies(val, depth + 1) ||
        (y instanceof AbstractValue && this.$Realm.pathConditions.impliesNot(y, depth + 1));
      return yi;
    } else if (this.kind === "&&") {
      let [x, y] = this.args;
      let xi =
        x.implies(val, depth + 1) ||
        (x instanceof AbstractValue && this.$Realm.pathConditions.impliesNot(x, depth + 1));
      if (xi) return true;
      let yi =
        y.implies(val, depth + 1) ||
        (y instanceof AbstractValue && this.$Realm.pathConditions.impliesNot(y, depth + 1));
      return yi;
    } else if (this.kind === "!") {
      let [nx] = this.args;
      invariant(nx instanceof AbstractValue);
      if (nx.kind === "!") {
        // !!x => val if x => val
        let [x] = nx.args;
        invariant(x instanceof AbstractValue);
        return x.implies(val, depth + 1);
      }
    } else if (this.kind === "conditional") {
      let [c, x, y] = this.args;
      // (c ? x : y) => val if x is true and y is false and c = val
      if (!x.mightNotBeTrue() && !y.mightNotBeFalse()) {
        return c.equals(val);
      }

      if (val.kind === "!==" || val.kind === "!=") {
        let [vx, vy] = val.args;
        if (!x.mightNotBeFalse()) {
          // (c ? false : y) => vx !== undefined && vx !== null if y => vx, since val is false unless y is true
          if (vx instanceof AbstractValue && (vy instanceof NullValue || vy instanceof UndefinedValue))
            return y.implies(vx, depth + 1);
          // (c ? false : y) => undefined !== vy && null !== vy if y => vy, since val is false unless y is true
          if ((vx instanceof NullValue || vx instanceof UndefinedValue) && vy instanceof AbstractValue)
            return y.implies(vy, depth + 1);
        } else if (!y.mightNotBeFalse()) {
          // (c ? x : false) => vx !== undefined && vx !== null if x => vx, since val is false unless x is true
          if (vx instanceof AbstractValue && (vy instanceof NullValue || vy instanceof UndefinedValue))
            return x.implies(vx, depth + 1);
          // (c ? x : false) => undefined !== vy && null !== vy if x => vy, since val is false unless x is true
          if ((vx instanceof NullValue || vx instanceof UndefinedValue) && vy instanceof AbstractValue)
            return x.implies(vy, depth + 1);
        }
      }

      // (c ? x : false) => c && x (if c or x were falsy, (c ? x : false) could not be true)
      if (!y.mightNotBeFalse()) {
        if (c.implies(val, depth + 1)) return true;
        if (x.implies(val, depth + 1)) return true;
      }
    } else if (this.kind === "!==") {
      // (0 !== x) => x since undefined, null, false, 0, NaN and "" are excluded by the !== and all other values are thruthy
      let [x, y] = this.args;
      if (x instanceof NumberValue && x.value === 0) return y.equals(val);
      if (y instanceof NumberValue && y.value === 0) return x.equals(val);
    } else if ((this.kind === "===" || this.kind === "==") && (val.kind === "===" || val.kind === "==")) {
      let [x, y] = this.args;
      let [vx, vy] = val.args;
      if (x instanceof NullValue || x instanceof UndefinedValue) {
        if (val.kind === "==") {
          // null/undefined === y && null/undefined === vy && y === vy => null/undefined == vy
          if (vx instanceof NullValue || vx instanceof UndefinedValue) return y.equals(vy);
          // null/undefined === y && vx === null/undefined && y === vx => null/undefined == vx
          if (vy instanceof NullValue || vy instanceof UndefinedValue) return y.equals(vx);
        } else {
          invariant(val.kind === "===");
          // null === y && null === vy && y === vy => null === vy
          // undefined === y && undefined === vy && y === vy => undefined === vy
          if (x.equals(vx)) return y.equals(vy);
          // null === y && vx === null && y === vx => vx === null
          // undefined === y && vx === undefined && y === vx => vx === undefined
          if (x.equals(vy)) return y.equals(vx);
        }
      }
      if (y instanceof NullValue || y instanceof UndefinedValue) {
        if (val.kind === "==") {
          // x === null/undefined && null/undefined === vy && x === vy => null/undefined == vy
          if (vx instanceof NullValue || vx instanceof UndefinedValue) return x.equals(vy);
          // x === null/undefined && vx === null/undefined && x === vx => null/undefined == vx
          if (vy instanceof NullValue || vy instanceof UndefinedValue) return x.equals(vx);
        } else {
          invariant(val.kind === "===");
          // x === null && null === vy && x === vy => null === vy
          // x == undefined && undefined === vy && x === vy => undefined === vy
          if (y.equals(vx)) return x.equals(vy);
          // x === null && vx === null && x === vx => null == vy
          // x === undefined && vx === undefined && x === vx => vx === undefined
          if (y.equals(vy)) return x.equals(vx);
        }
      }
    }
    // x => !y if y => !x
    if (val.kind === "!") {
      let [y] = val.args;
      invariant(y instanceof AbstractValue);
      return y.impliesNot(this, depth + 1);
    }
    return false;
  }

  // this => !val. A false value does not imply that !(this => !val).
  impliesNot(val: AbstractValue, depth: number = 0): boolean {
    if (depth > 5) return false;
    if (this.equals(val)) return false; // x => x regardless of its value, hence x => !val is false
    if (this.kind === "||") {
      let [x, y] = this.args;
      let xi = x.impliesNot(val, depth + 1);
      if (!xi) return false;
      let yi = y.impliesNot(val, depth + 1);
      return yi;
    } else if (this.kind === "&&") {
      let [x, y] = this.args;
      let xi = x.impliesNot(val, depth + 1);
      if (xi) return true;
      let yi = y.impliesNot(val, depth + 1);
      return yi;
    } else if (this.kind === "!") {
      let [nx] = this.args;
      invariant(nx instanceof AbstractValue);
      if (nx.kind === "!") {
        // !!x => !y if y => !x
        let [x] = nx.args;
        invariant(x instanceof AbstractValue);
        return x.impliesNot(val, depth + 1);
      }
      if (nx.kind === "abstractConcreteUnion") return false; // can't use two valued logic for this.
      // !x => !val if val => x since if val is false x can be any value and if val is true then x must be true
      return val.implies(nx);
    } else if (this.kind === "conditional") {
      let [c, x, y] = this.args;
      // (c ? x : y) => !val if x is false and y is true and c = val
      if (!x.mightNotBeFalse() && !y.mightNotBeTrue()) {
        return c.equals(val);
      }

      if (val.kind === "===" || val.kind === "==") {
        let [vx, vy] = val.args;
        if (!x.mightNotBeFalse()) {
          // (c ? false : y) => !(vx === undefined) && !(vx === null) if y => vx, since val is false unless y is true
          if (vx instanceof AbstractValue && (vy instanceof NullValue || vy instanceof UndefinedValue))
            return y.implies(vx, depth + 1);
          // (c ? false : y) => !(undefined === vy) && !(null === vy) if y => vy, since val is false unless y is true
          if ((vx instanceof NullValue || vx instanceof UndefinedValue) && vy instanceof AbstractValue)
            return y.implies(vy, depth + 1);
        } else if (!y.mightNotBeFalse()) {
          // (c ? x : false) => !(vx === undefined) && !(vx === null) if x => vx, since val is false unless x is true
          if (vx instanceof AbstractValue && (vy instanceof NullValue || vy instanceof UndefinedValue))
            return x.implies(vx, depth + 1);
          // (c ? x : false) => !(undefined === vy) && !(null !== vy) if x => vy, since val is false unless x is true
          if ((vx instanceof NullValue || vx instanceof UndefinedValue) && vy instanceof AbstractValue)
            return x.implies(vy, depth + 1);
        }
      }

      // (c ? x : false) => c && x (if c or x were falsy, (c ? x : false) could not be true)
      if (!y.mightNotBeFalse()) {
        if (c.impliesNot(val, depth + 1)) return true;
        if (x.impliesNot(val, depth + 1)) return true;
      }
    } else if (this.kind === "===" && val.kind === "===") {
      // x === y and y !== z => !(x === z)
      let [x1, y1] = this.args;
      let [x2, y2] = val.args;
      if (x1.equals(x2) && y1 instanceof ConcreteValue && y2 instanceof ConcreteValue && !y1.equals(y2)) return true;
      // x === y and x !== z => !(z === y)
      if (y1.equals(y2) && x1 instanceof ConcreteValue && x2 instanceof ConcreteValue && !x1.equals(x2)) {
        return true;
      }
    }
    return false;
  }

  isTemporal(): boolean {
    return this.$Realm.getTemporalOperationEntryFromDerivedValue(this) !== undefined;
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
    if (valueType === EmptyValue) return false;
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

  static createJoinConditionForSelectedCompletions(
    selector: Completion => boolean,
    completion: JoinedAbruptCompletions | JoinedNormalAndAbruptCompletions
  ): Value {
    let jcw;
    let jc = completion.joinCondition;
    let realm = jc.$Realm;
    let njc = AbstractValue.createFromUnaryOp(realm, "!", jc, true, undefined, true);
    if (completion instanceof JoinedNormalAndAbruptCompletions && completion.composedWith !== undefined) {
      jcw = AbstractValue.createJoinConditionForSelectedCompletions(selector, completion.composedWith);
      jc = AbstractValue.createFromLogicalOp(realm, "&&", jcw, jc, undefined, true);
      njc = AbstractValue.createFromLogicalOp(realm, "&&", jcw, njc, undefined, true);
    }
    let c = completion.consequent;
    let a = completion.alternate;
    let cContainsSelectedCompletion = c.containsSelectedCompletion(selector);
    let aContainsSelectedCompletion = a.containsSelectedCompletion(selector);
    if (!cContainsSelectedCompletion && !aContainsSelectedCompletion) {
      if (jcw !== undefined) return jcw;
      return realm.intrinsics.false;
    }
    let cCond = jc;
    if (cContainsSelectedCompletion) {
      if (c instanceof JoinedAbruptCompletions || c instanceof JoinedNormalAndAbruptCompletions) {
        let jcc = AbstractValue.createJoinConditionForSelectedCompletions(selector, c);
        cCond = AbstractValue.createFromLogicalOp(realm, "&&", cCond, jcc, undefined, true);
      }
      if (!aContainsSelectedCompletion) return cCond;
    }
    let aCond = njc;
    if (aContainsSelectedCompletion) {
      if (a instanceof JoinedAbruptCompletions || a instanceof JoinedNormalAndAbruptCompletions) {
        let jac = AbstractValue.createJoinConditionForSelectedCompletions(selector, a);
        aCond = AbstractValue.createFromLogicalOp(realm, "&&", aCond, jac, undefined, true);
      }
      if (!cContainsSelectedCompletion) return aCond;
    }
    let or = AbstractValue.createFromLogicalOp(realm, "||", cCond, aCond, undefined, true);
    if (completion instanceof JoinedNormalAndAbruptCompletions && completion.composedWith !== undefined) {
      let composedCond = AbstractValue.createJoinConditionForSelectedCompletions(selector, completion.composedWith);
      let and = AbstractValue.createFromLogicalOp(realm, "&&", composedCond, or, undefined, true);
      return and;
    }
    return or;
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
    let operationDescriptor = createOperationDescriptor("BINARY_EXPRESSION", { binaryOperator: op });
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
    op: BabelLogicalOperator,
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
    let operationDescriptor = createOperationDescriptor("LOGICAL_EXPRESSION", { logicalOperator: op });
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
    let operationDescriptor = createOperationDescriptor("UNARY_EXPRESSION", { unaryOperator: op, prefix });
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
    templateSource: string,
    resultType: typeof Value,
    operands: Array<Value>,
    loc?: ?BabelNodeSourceLocation
  ): AbstractValue {
    let kind = AbstractValue.makeKind("template", templateSource);
    let resultTypes = new TypesDomain(resultType);
    let resultValues = ValuesDomain.topVal;
    let hash;
    [hash, operands] = hashCall(kind, ...operands);
    let Constructor = Value.isTypeCompatibleWith(resultType, ObjectValue) ? AbstractObjectValue : AbstractValue;
    invariant(Placeholders.length >= operands.length);
    let operationDescriptor = createOperationDescriptor("ABSTRACT_FROM_TEMPLATE", { templateSource });
    // This doesn't mean that the function is not pure, just that it creates
    // a new object on each call and thus is a future optimization opportunity.
    if (Value.isTypeCompatibleWith(resultType, ObjectValue)) hash = ++realm.objectCount;
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
    if (Value.isTypeCompatibleWith(resultType, ObjectValue)) hash = ++realm.objectCount;
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
    templateSource: string,
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
    let temp = AbstractValue.createFromTemplate(realm, templateSource, resultType, operands);
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

  static convertToTemporalIfArgsAreTemporal(realm: Realm, val: AbstractValue, condArgs?: Array<Value>): AbstractValue {
    if (condArgs === undefined) condArgs = val.args;

    let temporalArg = condArgs.find(arg => arg.isTemporal());
    if (temporalArg !== undefined) {
      let realmGenerator = realm.generator;
      invariant(realmGenerator !== undefined);
      invariant(val.operationDescriptor !== undefined);
      return realmGenerator.deriveAbstract(val.types, val.values, val.args, val.operationDescriptor);
    } else {
      return val;
    }
  }

  static dischargeValuesFromUnion(realm: Realm, union: AbstractValue): [AbstractValue, Array<ConcreteValue>] {
    invariant(union instanceof AbstractValue && union.kind === "abstractConcreteUnion");
    let abstractValue = union.args[0];
    invariant(abstractValue instanceof AbstractValue);

    let concreteValues = (union.args.filter(e => e instanceof ConcreteValue): any);
    invariant(concreteValues.length === union.args.length - 1);

    if (!abstractValue.isTemporal()) {
      // We make the abstract value in an abstract concrete union temporal, as it is predicated
      // on the conditions that preclude the concrete values in the union. The type invariant
      // also only applies in that condition, so it is skipped when deriving the value
      // See #2327
      let realmGenerator = realm.generator;

      invariant(realmGenerator !== undefined);
      invariant(abstractValue.operationDescriptor !== undefined);
      abstractValue = realmGenerator.deriveAbstract(
        abstractValue.types,
        abstractValue.values,
        abstractValue.args,
        abstractValue.operationDescriptor,
        {
          isPure: true,
          skipInvariant: true,
        }
      );
    }

    return [abstractValue, concreteValues];
  }

  // Creates a union of an abstract value with one or more concrete values.
  // The operation descriptor for the abstract values becomes the operation descriptor for the union.
  // Use this only to allow instrinsic abstract objects to be null and/or undefined.
  static createAbstractConcreteUnion(
    realm: Realm,
    abstractValue: AbstractValue,
    concreteValues: Array<ConcreteValue>
  ): AbstractValue {
    invariant(concreteValues.length > 0);
    invariant(abstractValue instanceof AbstractValue);

    let checkedConcreteValues = (concreteValues.filter(e => e instanceof ConcreteValue): any);
    invariant(checkedConcreteValues.length === concreteValues.length);

    let concreteSet: Set<ConcreteValue> = new Set(checkedConcreteValues);
    let values;

    if (!abstractValue.values.isTop()) {
      abstractValue.values.getElements().forEach(v => concreteSet.add(v));
      values = new ValuesDomain(concreteSet);
    } else {
      values = ValuesDomain.topVal;
    }
    let types = TypesDomain.topVal;
    let [hash, operands] = hashCall("abstractConcreteUnion", abstractValue, ...checkedConcreteValues);
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

  static createAbstractObject(
    realm: Realm,
    name: string,
    templateOrShape?: ObjectValue | ShapeInformationInterface
  ): AbstractObjectValue {
    let value;
    if (templateOrShape === undefined) {
      templateOrShape = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
    }
    value = AbstractValue.createFromTemplate(realm, name, ObjectValue, []);
    if (!realm.isNameStringUnique(name)) {
      value.hashValue = ++realm.objectCount;
    } else {
      realm.saveNameString(name);
    }
    value.intrinsicName = name;
    if (templateOrShape instanceof ObjectValue) {
      templateOrShape.makePartial();
      templateOrShape.makeSimple();
      value.values = new ValuesDomain(new Set([templateOrShape]));
      realm.rebuildNestedProperties(value, name);
    } else {
      value.shape = templateOrShape;
    }
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
