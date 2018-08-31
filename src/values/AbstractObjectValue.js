/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { CompilerDiagnostic, FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import type { Descriptor, PropertyKeyValue, ShapeInformationInterface } from "../types.js";
import {
  AbstractValue,
  type AbstractValueKind,
  ArrayValue,
  BooleanValue,
  NullValue,
  NumberValue,
  ObjectValue,
  PrimitiveValue,
  StringValue,
  Value,
} from "./index.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { IsDataDescriptor } from "../methods/index.js";
import { Leak, Join, Widen } from "../singletons.js";
import invariant from "../invariant.js";
import { createOperationDescriptor, type OperationDescriptor } from "../utils/generator.js";
import { construct_empty_effects } from "../realm.js";
import { SimpleNormalCompletion } from "../completions.js";
import { cloneDescriptor, equalDescriptors, PropertyDescriptor } from "../descriptors.js";

export default class AbstractObjectValue extends AbstractValue {
  constructor(
    realm: Realm,
    types: TypesDomain,
    values: ValuesDomain,
    hashValue: number,
    args: Array<Value>,
    operationDescriptor?: OperationDescriptor,
    optionalArgs?: {| kind?: AbstractValueKind, intrinsicName?: string, shape?: ShapeInformationInterface |}
  ) {
    super(realm, types, values, hashValue, args, operationDescriptor, optionalArgs);
    if (!values.isTop()) {
      for (let element of this.values.getElements()) invariant(element instanceof ObjectValue);
    }
  }

  cachedIsSimpleObject: void | boolean;
  functionResultType: void | typeof Value;

  getTemplate(): ObjectValue {
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      if (element.isPartialObject()) {
        return element;
      } else {
        break;
      }
    }
    AbstractValue.reportIntrospectionError(this);
    throw new FatalError();
  }

  set temporalAlias(temporalValue: AbstractObjectValue) {
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      element.temporalAlias = temporalValue;
    }
  }

  hasStringOrSymbolProperties(): boolean {
    if (this.values.isTop()) return false;
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      if (element.hasStringOrSymbolProperties()) return true;
    }
    return false;
  }

  isPartialObject(): boolean {
    // At the very least, the identity of the object is unknown
    return true;
  }

  isSimpleObject(): boolean {
    if (this.cachedIsSimpleObject === undefined) this.cachedIsSimpleObject = this._elementsAreSimpleObjects();
    return this.cachedIsSimpleObject;
  }

  _elementsAreSimpleObjects(): boolean {
    if (this.values.isTop()) return false;
    let result;
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      if (result === undefined) {
        result = element.isSimpleObject();
      } else if (result !== element.isSimpleObject()) {
        AbstractValue.reportIntrospectionError(this);
        throw new FatalError();
      }
    }
    if (result === undefined) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
    return result;
  }

  mightBeFinalObject(): boolean {
    // modeled objects are always read-only
    if (this.shape) return true;
    if (this.values.isTop()) return false;
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      if (element.mightBeFinalObject()) return true;
    }
    return false;
  }

  mightNotBeFinalObject(): boolean {
    // modeled objects are always read-only
    if (this.shape) return false;
    if (this.values.isTop()) return false;
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      if (element.mightNotBeFinalObject()) return true;
    }
    return false;
  }

  mightBeFalse(): boolean {
    return false;
  }

  mightNotBeFalse(): boolean {
    return true;
  }

  makePartial(): void {
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      element.makePartial();
    }
  }

  makeSimple(option?: string | Value): void {
    if (this.values.isTop() && this.getType() === ObjectValue) {
      let obj = new ObjectValue(this.$Realm, this.$Realm.intrinsics.ObjectPrototype);
      obj.intrinsicName = this.intrinsicName;
      obj.intrinsicNameGenerated = true;
      obj.makePartial();
      obj._templateFor = this;
      this.values = new ValuesDomain(obj);
    }
    if (!this.values.isTop()) {
      for (let element of this.values.getElements()) {
        invariant(element instanceof ObjectValue);
        element.makeSimple(option);
      }
    }
    this.cachedIsSimpleObject = true;
  }

  // Use this only if it is known that only the string properties of the snapshot will be accessed.
  getSnapshot(options?: { removeProperties: boolean }): AbstractObjectValue {
    if (this.isIntrinsic()) return this; // already temporal
    if (this.values.isTop()) return this; // always the same
    if (this.kind === "conditional") {
      let [c, l, r] = this.args;
      invariant(l instanceof ObjectValue || l instanceof AbstractObjectValue);
      let ls = l.getSnapshot(options);
      invariant(r instanceof ObjectValue || r instanceof AbstractObjectValue);
      let rs = r.getSnapshot(options);
      invariant(c instanceof AbstractValue);
      let absVal = AbstractValue.createFromConditionalOp(this.$Realm, c, ls, rs, this.expressionLocation);
      invariant(absVal instanceof AbstractObjectValue);
      return absVal;
    }
    // If this is some other kind of abstract object we don't know how to make a copy, so just make this final
    this.makeFinal();
    return this;
  }

  makeFinal(): void {
    if (this.shape) return;
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
    for (let element of this.values.getElements()) {
      invariant(element instanceof ObjectValue);
      element.makeFinal();
    }
  }

  throwIfNotObject(): AbstractObjectValue {
    return this;
  }

  usesOrdinaryObjectInternalPrototypeMethods(): boolean {
    return true;
  }

  // ECMA262 9.1.1
  $GetPrototypeOf(): ObjectValue | AbstractObjectValue | NullValue {
    let realm = this.$Realm;
    if (this.values.isTop()) {
      let error = new CompilerDiagnostic(
        "prototype access on unknown object",
        this.$Realm.currentLocation,
        "PP0032",
        "FatalError"
      );
      this.$Realm.handleError(error);
      throw new FatalError();
    }
    invariant(this.kind !== "widened", "widening currently always leads to top values");
    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$GetPrototypeOf();
      }
      invariant(false);
    } else if (this.kind === "conditional") {
      // this is the join of two concrete/abstract objects
      // use this join condition for the join of the two property values
      let [cond, ob1, ob2] = this.args;
      invariant(cond instanceof AbstractValue);
      invariant(ob1 instanceof ObjectValue || ob1 instanceof AbstractObjectValue);
      invariant(ob2 instanceof ObjectValue || ob2 instanceof AbstractObjectValue);
      let p1 = ob1.$GetPrototypeOf();
      let p2 = ob2.$GetPrototypeOf();
      let joinedObject = AbstractValue.createFromConditionalOp(realm, cond, p1, p2);
      invariant(
        joinedObject instanceof AbstractObjectValue ||
          joinedObject instanceof ObjectValue ||
          joinedObject instanceof NullValue
      );
      return joinedObject;
    } else if (this.kind === "explicit conversion to object") {
      let primitiveValue = this.args[0];
      invariant(!Value.isTypeCompatibleWith(primitiveValue.getType(), PrimitiveValue));
      let result = AbstractValue.createFromBuildFunction(
        realm,
        ObjectValue,
        [primitiveValue],
        createOperationDescriptor("ABSTRACT_OBJECT_GET_PROTO_OF")
      );
      invariant(result instanceof AbstractObjectValue);
      return result;
    } else {
      let joinedObject;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let p = cv.$GetPrototypeOf();
        if (joinedObject === undefined) {
          joinedObject = p;
        } else {
          let cond = AbstractValue.createFromBinaryOp(realm, "===", this, cv, this.expressionLocation);
          joinedObject = AbstractValue.createFromConditionalOp(realm, cond, p, joinedObject);
        }
      }
      invariant(
        joinedObject instanceof AbstractObjectValue ||
          joinedObject instanceof ObjectValue ||
          joinedObject instanceof NullValue
      );
      return joinedObject;
    }
  }

  // ECMA262 9.1.3
  $IsExtensible(): boolean {
    return false;
  }

  // ECMA262 9.1.5
  $GetOwnProperty(_P: PropertyKeyValue): Descriptor | void {
    let P = _P;
    if (P instanceof StringValue) P = P.value;

    if (this.values.isTop()) {
      let error = new CompilerDiagnostic(
        "property access on unknown object",
        this.$Realm.currentLocation,
        "PP0031",
        "FatalError"
      );
      this.$Realm.handleError(error);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$GetOwnProperty(P);
      }
      invariant(false);
    } else if (this.kind === "conditional") {
      // this is the join of two concrete/abstract objects
      // use this join condition for the join of the two property values
      let [cond, ob1, ob2] = this.args;
      invariant(cond instanceof AbstractValue);
      invariant(ob1 instanceof ObjectValue || ob1 instanceof AbstractObjectValue);
      invariant(ob2 instanceof ObjectValue || ob2 instanceof AbstractObjectValue);
      let d1 = ob1.$GetOwnProperty(P);
      let d2 = ob2.$GetOwnProperty(P);
      return Join.joinDescriptors(this.$Realm, cond, d1, d2);
    } else if (this.kind === "widened") {
      // This abstract object was created by repeated assignments of freshly allocated objects to the same binding inside a loop
      let [ob1, ob2] = this.args; // ob1: summary of iterations 1...n, ob2: summary of iteration n+1
      invariant(ob1 instanceof ObjectValue);
      invariant(ob2 instanceof ObjectValue);
      let d1 = ob1.$GetOwnProperty(P);
      let d2 = ob2.$GetOwnProperty(P);
      if (d1 === undefined || d2 === undefined) {
        // We do not handle the case where different loop iterations result in different kinds of propperties
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      d1 = d1.throwIfNotConcrete(this.$Realm);
      d2 = d2.throwIfNotConcrete(this.$Realm);
      if (!equalDescriptors(d1, d2)) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      let desc = cloneDescriptor(d1);
      invariant(desc !== undefined);
      if (IsDataDescriptor(this.$Realm, desc)) {
        // Values may be different, i.e. values may be loop variant, so the widened value summarizes the entire loop
        // equalDescriptors guarantees that both have value props and if you have a value prop is value is defined.
        let d1Value = d1.value;
        invariant(d1Value instanceof Value);
        let d2Value = d2.value;
        invariant(d2Value instanceof Value);
        let dValue = Widen.widenValues(this.$Realm, d1Value, d2Value);
        invariant(dValue instanceof Value);
        desc.value = dValue;
      } else {
        // In this case equalDescriptors guarantees exact equality betwee d1 and d2.
        // Inlining the accessors will eventually bring in data properties if the accessors have loop variant behavior
      }
      return desc;
    } else {
      let first = true;
      let joinedDescriptor;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let desc = cv.$GetOwnProperty(P);
        if (first) {
          first = false;
          joinedDescriptor = desc;
        } else {
          let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
          invariant(cond instanceof AbstractValue);
          joinedDescriptor = Join.joinDescriptors(this.$Realm, cond, desc, joinedDescriptor);
        }
      }
      return joinedDescriptor;
    }
  }

  // ECMA262 9.1.6
  $DefineOwnProperty(_P: PropertyKeyValue, _Desc: Descriptor): boolean {
    let P = _P;
    if (P instanceof StringValue) P = P.value;
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this, P);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$DefineOwnProperty(P, _Desc);
      }
      invariant(false);
    } else {
      let Desc = _Desc.throwIfNotConcrete(this.$Realm);
      if (!IsDataDescriptor(this.$Realm, Desc)) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      // Extract the first existing descriptor to get its existing attributes as defaults.
      let firstExistingDesc;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        firstExistingDesc = cv.$GetOwnProperty(P);
        if (firstExistingDesc) {
          break;
        }
      }
      if (firstExistingDesc) {
        firstExistingDesc = firstExistingDesc.throwIfNotConcrete(this.$Realm);
      }
      let desc = new PropertyDescriptor({
        value: Desc.value !== undefined ? Desc.value : this.$Realm.intrinsics.undefined,
        writable: Desc.writable !== undefined ? Desc.writable : firstExistingDesc ? firstExistingDesc.writable : false,
        enumerable:
          Desc.enumerable !== undefined ? Desc.enumerable : firstExistingDesc ? firstExistingDesc.enumerable : false,
        configurable:
          Desc.configurable !== undefined
            ? Desc.configurable
            : firstExistingDesc
              ? firstExistingDesc.configurable
              : false,
      });
      let newVal = desc.value;
      if (this.kind === "conditional") {
        // this is the join of two concrete/abstract objects
        // use this join condition for the join of the two property values
        let [cond, ob1, ob2] = this.args;
        invariant(cond instanceof AbstractValue);
        invariant(ob1 instanceof ObjectValue || ob1 instanceof AbstractObjectValue);
        invariant(ob2 instanceof ObjectValue || ob2 instanceof AbstractObjectValue);
        let d1 = ob1.$GetOwnProperty(P);
        let d2 = ob2.$GetOwnProperty(P);
        if (d1 !== undefined) {
          d1 = d1.throwIfNotConcrete(this.$Realm);
          if (!equalDescriptors(d1, desc)) {
            AbstractValue.reportIntrospectionError(this, P);
            throw new FatalError();
          }
        }
        if (d2 !== undefined) {
          d2 = d2.throwIfNotConcrete(this.$Realm);
          if (!equalDescriptors(d2, desc)) {
            AbstractValue.reportIntrospectionError(this, P);
            throw new FatalError();
          }
        }
        let oldVal1 = d1 === undefined || d1.value === undefined ? this.$Realm.intrinsics.empty : d1.value;
        let oldVal2 = d2 === undefined || d2.value === undefined ? this.$Realm.intrinsics.empty : d2.value;
        invariant(oldVal1 instanceof Value);
        invariant(oldVal2 instanceof Value);
        let newVal1 = AbstractValue.createFromConditionalOp(this.$Realm, cond, newVal, oldVal1);
        let newVal2 = AbstractValue.createFromConditionalOp(this.$Realm, cond, oldVal2, newVal);
        desc.value = newVal1;
        let result1 = ob1.$DefineOwnProperty(P, desc);
        desc.value = newVal2;
        let result2 = ob2.$DefineOwnProperty(P, desc);
        if (result1 !== result2) {
          AbstractValue.reportIntrospectionError(this, P);
          throw new FatalError();
        }
        return result1;
      } else {
        invariant(newVal instanceof Value);
        let sawTrue = false;
        let sawFalse = false;
        for (let cv of elements) {
          invariant(cv instanceof ObjectValue);
          let d = cv.$GetOwnProperty(P);
          if (d !== undefined) {
            d = d.throwIfNotConcrete(this.$Realm);
            if (!equalDescriptors(d, desc)) {
              AbstractValue.reportIntrospectionError(this, P);
              throw new FatalError();
            }
          }
          let dval = d === undefined || d.value === undefined ? this.$Realm.intrinsics.empty : d.value;
          invariant(dval instanceof Value);
          let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
          desc.value = AbstractValue.createFromConditionalOp(this.$Realm, cond, newVal, dval);
          if (cv.$DefineOwnProperty(P, desc)) {
            sawTrue = true;
          } else sawFalse = true;
        }
        if (sawTrue && sawFalse) {
          AbstractValue.reportIntrospectionError(this, P);
          throw new FatalError();
        }
        return sawTrue;
      }
    }
  }

  // ECMA262 9.1.7
  $HasProperty(_P: PropertyKeyValue): boolean {
    let P = _P;
    if (P instanceof StringValue) P = P.value;
    if (this.values.isTop()) {
      let error = new CompilerDiagnostic(
        "property access on unknown object",
        this.$Realm.currentLocation,
        "PP0031",
        "FatalError"
      );
      this.$Realm.handleError(error);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$HasProperty(P);
      }
      invariant(false);
    } else {
      let hasProp = false;
      let doesNotHaveProp = false;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        if (cv.$HasProperty(P)) hasProp = true;
        else doesNotHaveProp = true;
      }
      if (hasProp && doesNotHaveProp) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      return hasProp;
    }
  }

  // ECMA262 9.1.8
  $Get(_P: PropertyKeyValue, Receiver: Value): Value {
    let P = _P;
    if (P instanceof StringValue) P = P.value;

    if (this.values.isTop()) {
      let generateAbstractGet = () => {
        let ob = Receiver;
        if (this.kind === "explicit conversion to object") ob = this.args[0];
        let type = Value;
        if (P === "length" && Value.isTypeCompatibleWith(this.getType(), ArrayValue)) type = NumberValue;
        // shape logic
        let shapeContainer = this.kind === "explicit conversion to object" ? this.args[0] : this;
        invariant(shapeContainer instanceof AbstractValue);
        let realm = this.$Realm;
        let shape = shapeContainer.shape;
        let propertyShape, propertyGetter;
        // propertyShape expects only a string value
        if (
          (realm.instantRender.enabled || realm.react.enabled) &&
          shape !== undefined &&
          (typeof P === "string" || P instanceof StringValue)
        ) {
          propertyShape = shape.getPropertyShape(P instanceof StringValue ? P.value : P);
          if (propertyShape !== undefined) {
            type = propertyShape.getAbstractType();
            propertyGetter = propertyShape.getGetter();
          }
        }
        // P can also be a SymbolValue
        if (typeof P === "string") {
          P = new StringValue(this.$Realm, P);
        }
        // Create an temporal array with widened properties
        if (type === ArrayValue) {
          return ArrayValue.createTemporalWithWidenedNumericProperty(
            realm,
            [ob, P],
            createOperationDescriptor("ABSTRACT_OBJECT_GET", { propertyGetter })
          );
        }
        let propAbsVal = AbstractValue.createTemporalFromBuildFunction(
          realm,
          type,
          [ob, P],
          createOperationDescriptor("ABSTRACT_OBJECT_GET", { propertyGetter }),
          {
            skipInvariant: true,
            isPure: true,
            shape: propertyShape,
          }
        );
        return propAbsVal;
      };
      if (this.isSimpleObject() && this.isIntrinsic()) {
        return generateAbstractGet();
      } else if (this.$Realm.isInPureScope()) {
        // This object might have leaked to a getter.
        Leak.value(this.$Realm, Receiver);
        // The getter might throw anything.
        return this.$Realm.evaluateWithPossibleThrowCompletion(
          generateAbstractGet,
          TypesDomain.topVal,
          ValuesDomain.topVal
        );
      }
      let error = new CompilerDiagnostic(
        "property access on unknown object",
        this.$Realm.currentLocation,
        "PP0031",
        "FatalError"
      );
      this.$Realm.handleError(error);
      throw new FatalError();
    }

    let realm = this.$Realm;
    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$Get(P, Receiver);
      }
      invariant(false);
    } else if (this.kind === "conditional") {
      // this is the join of two concrete/abstract objects
      // use this join condition for the join of the two property values
      let [cond, ob1, ob2] = this.args;
      invariant(cond instanceof AbstractValue);
      invariant(ob1 instanceof ObjectValue || ob1 instanceof AbstractObjectValue);
      invariant(ob2 instanceof ObjectValue || ob2 instanceof AbstractObjectValue);
      // Evaluate the effect of each getter separately and join the result.
      return realm.evaluateWithAbstractConditional(
        cond,
        () => realm.evaluateForEffects(() => ob1.$Get(P, Receiver), undefined, "ConditionalGet/1"),
        () => realm.evaluateForEffects(() => ob2.$Get(P, Receiver), undefined, "ConditionalGet/2")
      );
    } else {
      let result;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
        invariant(cond instanceof AbstractValue);
        result = realm.evaluateWithAbstractConditional(
          cond,
          () => realm.evaluateForEffects(() => cv.$Get(P, Receiver), undefined, "AbstractGet"),
          () => construct_empty_effects(realm, result === undefined ? undefined : new SimpleNormalCompletion(result))
        );
      }
      invariant(result !== undefined);
      return result;
    }
  }

  $GetPartial(P: AbstractValue | PropertyKeyValue, Receiver: Value): Value {
    if (!(P instanceof AbstractValue)) return this.$Get(P, Receiver);
    if (this.values.isTop() || !this.isSimpleObject()) {
      if (this.isSimpleObject() && this.isIntrinsic()) {
        return AbstractValue.createTemporalFromBuildFunction(
          this.$Realm,
          Value,
          [this, P],
          createOperationDescriptor("ABSTRACT_OBJECT_GET_PARTIAL"),
          { skipInvariant: true, isPure: true }
        );
      }
      if (this.$Realm.isInPureScope()) {
        // If we're in a pure scope, we can leak the key and the instance,
        // and leave the residual property access in place.
        // We assume that if the receiver is different than this object,
        // then we only got here because there can be no other keys with
        // this name on earlier parts of the prototype chain.
        // We have to leak since the property may be a getter or setter,
        // which can run unknown code that has access to Receiver and
        // (even in pure mode) can modify it in unknown ways.
        Leak.value(this.$Realm, Receiver);
        // Coercion can only have effects on anything reachable from the key.
        Leak.value(this.$Realm, P);
        return AbstractValue.createTemporalFromBuildFunction(
          this.$Realm,
          Value,
          [Receiver, P],
          createOperationDescriptor("ABSTRACT_OBJECT_GET_PARTIAL"),
          { skipInvariant: true, isPure: true }
        );
      }
      let error = new CompilerDiagnostic(
        "property access on unknown object",
        this.$Realm.currentLocation,
        "PP0031",
        "FatalError"
      );
      this.$Realm.handleError(error);
      throw new FatalError();
    }

    let realm = this.$Realm;

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$GetPartial(P, Receiver);
      }
      invariant(false);
    } else if (this.kind === "conditional") {
      // this is the join of two concrete/abstract objects
      // use this join condition for the join of the two property values
      let [cond, ob1, ob2] = this.args;
      invariant(cond instanceof AbstractValue);
      invariant(ob1 instanceof ObjectValue || ob1 instanceof AbstractObjectValue);
      invariant(ob2 instanceof ObjectValue || ob2 instanceof AbstractObjectValue);
      // Evaluate the effect of each getter separately and join the result.
      return realm.evaluateWithAbstractConditional(
        cond,
        () => realm.evaluateForEffects(() => ob1.$GetPartial(P, Receiver), undefined, "ConditionalGet/1"),
        () => realm.evaluateForEffects(() => ob2.$GetPartial(P, Receiver), undefined, "ConditionalGet/2")
      );
    } else {
      let result;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
        invariant(cond instanceof AbstractValue);
        result = realm.evaluateWithAbstractConditional(
          cond,
          () => realm.evaluateForEffects(() => cv.$GetPartial(P, Receiver), undefined, "AbstractGet"),
          () => construct_empty_effects(realm, result === undefined ? undefined : new SimpleNormalCompletion(result))
        );
      }
      invariant(result !== undefined);
      return result;
    }
  }

  // ECMA262 9.1.9
  $Set(P: PropertyKeyValue, V: Value, Receiver: Value): boolean {
    if (this.values.isTop()) {
      return this.$SetPartial(P, V, Receiver);
    }

    let realm = this.$Realm;
    let elements = this.values.getElements();

    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$Set(P, V, Receiver);
      }
      invariant(false);
    } else if (this.kind === "conditional") {
      // this is the join of two concrete/abstract objects
      // use this join condition for the join of the two property values
      let [cond, ob1, ob2] = this.args;
      invariant(cond instanceof AbstractValue);
      invariant(ob1 instanceof ObjectValue || ob1 instanceof AbstractObjectValue);
      invariant(ob2 instanceof ObjectValue || ob2 instanceof AbstractObjectValue);
      // Evaluate the effect of each setter separately and join the effects.
      let result = realm.evaluateWithAbstractConditional(
        cond,
        () =>
          realm.evaluateForEffects(
            () => new BooleanValue(realm, ob1.$Set(P, V, Receiver)),
            undefined,
            "ConditionalSet/1"
          ),
        () =>
          realm.evaluateForEffects(
            () => new BooleanValue(realm, ob2.$Set(P, V, Receiver)),
            undefined,
            "ConditionalSet/2"
          )
      );
      if (!(result instanceof BooleanValue)) {
        let error = new CompilerDiagnostic(
          "object could have both succeeded and failed updating",
          realm.currentLocation,
          "PP0041",
          "RecoverableError"
        );
        if (realm.handleError(error) === "Recover") {
          return true;
        }
        throw new FatalError();
      }
      return result.value;
    } else {
      let sawTrue = false;
      let sawFalse = false;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        // Evaluate the effect of each setter separately and join the effects.
        let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
        invariant(cond instanceof AbstractValue);
        realm.evaluateWithAbstractConditional(
          cond,
          () =>
            realm.evaluateForEffects(
              () => {
                if (cv.$Set(P, V, Receiver)) {
                  sawTrue = true;
                } else {
                  sawFalse = true;
                }
                return realm.intrinsics.empty;
              },
              undefined,
              "AbstractSet"
            ),
          () => construct_empty_effects(realm)
        );
      }
      if (sawTrue && sawFalse) {
        let error = new CompilerDiagnostic(
          "object could have both succeeded and failed updating",
          realm.currentLocation,
          "PP0041",
          "RecoverableError"
        );
        if (realm.handleError(error) === "Recover") {
          return true;
        }
      }
      return sawTrue;
    }
  }

  $SetPartial(_P: AbstractValue | PropertyKeyValue, V: Value, Receiver: Value): boolean {
    let P = _P;
    if (!this.values.isTop() && !(P instanceof AbstractValue)) return this.$Set(P, V, Receiver);
    if (this.values.isTop()) {
      if (this.$Realm.isInPureScope()) {
        // If we're in a pure scope, we can leak the key and the instance,
        // and leave the residual property assignment in place.
        // We assume that if the receiver is different than this object,
        // then we only got here because there can be no other keys with
        // this name on earlier parts of the prototype chain.
        // We have to leak since the property may be a getter or setter,
        // which can run unknown code that has access to Receiver and
        // (even in pure mode) can modify it in unknown ways.
        Leak.value(this.$Realm, Receiver);
        // We also need to leaked the value since it might leak to a setter.
        Leak.value(this.$Realm, V);
        this.$Realm.evaluateWithPossibleThrowCompletion(
          () => {
            let generator = this.$Realm.generator;
            invariant(generator);

            if (typeof P !== "string" && !(P instanceof StringValue)) {
              // Coercion can only have effects on anything reachable from the key.
              Leak.value(this.$Realm, P);
            }
            generator.emitPropertyAssignment(Receiver, P, V);
            return this.$Realm.intrinsics.undefined;
          },
          TypesDomain.topVal,
          ValuesDomain.topVal
        );
        // The emitted assignment might throw at runtime but if it does, that
        // is handled by evaluateWithPossibleThrowCompletion. Anything that
        // happens after this, can assume we didn't throw and therefore,
        // we return true here.
        return true;
      }
      let error = new CompilerDiagnostic(
        "property access on unknown object",
        this.$Realm.currentLocation,
        "PP0031",
        "FatalError"
      );
      this.$Realm.handleError(error);
      throw new FatalError();
    }

    let realm = this.$Realm;
    let elements = this.values.getElements();

    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$SetPartial(P, V, Receiver);
      }
      invariant(false);
    } else if (this.kind === "conditional") {
      // this is the join of two concrete/abstract objects
      // use this join condition for the join of the two property values
      let [cond, ob1, ob2] = this.args;
      invariant(cond instanceof AbstractValue);
      invariant(ob1 instanceof ObjectValue || ob1 instanceof AbstractObjectValue);
      invariant(ob2 instanceof ObjectValue || ob2 instanceof AbstractObjectValue);
      // Evaluate the effect of each setter separately and join the effects.
      let result = realm.evaluateWithAbstractConditional(
        cond,
        () =>
          realm.evaluateForEffects(
            () => new BooleanValue(realm, ob1.$SetPartial(P, V, Receiver)),
            undefined,
            "ConditionalSet/1"
          ),
        () =>
          realm.evaluateForEffects(
            () => new BooleanValue(realm, ob2.$SetPartial(P, V, Receiver)),
            undefined,
            "ConditionalSet/2"
          )
      );
      if (!(result instanceof BooleanValue)) {
        let error = new CompilerDiagnostic(
          "object could have both succeeded and failed updating",
          realm.currentLocation,
          "PP0041",
          "RecoverableError"
        );
        if (realm.handleError(error) === "Recover") {
          return true;
        }
        throw new FatalError();
      }
      return result.value;
    } else {
      let sawTrue = false;
      let sawFalse = false;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        // Evaluate the effect of each setter separately and join the effects.
        let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
        invariant(cond instanceof AbstractValue);
        realm.evaluateWithAbstractConditional(
          cond,
          () =>
            realm.evaluateForEffects(
              () => {
                if (cv.$SetPartial(P, V, Receiver)) {
                  sawTrue = true;
                } else {
                  sawFalse = true;
                }
                return realm.intrinsics.empty;
              },
              undefined,
              "AbstractSet"
            ),
          () => construct_empty_effects(realm)
        );
      }
      if (sawTrue && sawFalse) {
        let error = new CompilerDiagnostic(
          "object could have both succeeded and failed updating",
          realm.currentLocation,
          "PP0041",
          "RecoverableError"
        );
        if (realm.handleError(error) === "Recover") {
          return true;
        }
      }
      return sawTrue;
    }
  }

  // ECMA262 9.1.10
  $Delete(_P: PropertyKeyValue): boolean {
    let P = _P;
    if (P instanceof StringValue) P = P.value;
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this, P);
      throw new FatalError();
    }

    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$Delete(P);
      }
      invariant(false);
    } else if (this.kind === "conditional") {
      // this is the join of two concrete/abstract objects
      // use this join condition for the join of the two property values
      let [cond, ob1, ob2] = this.args;
      invariant(cond instanceof AbstractValue);
      invariant(ob1 instanceof ObjectValue || ob1 instanceof AbstractObjectValue);
      invariant(ob2 instanceof ObjectValue || ob2 instanceof AbstractObjectValue);
      let d1 = ob1.$GetOwnProperty(P);
      let d2 = ob2.$GetOwnProperty(P);
      let oldVal1 =
        d1 === undefined ? this.$Realm.intrinsics.empty : IsDataDescriptor(this.$Realm, d1) ? d1.value : undefined;
      let oldVal2 =
        d2 === undefined ? this.$Realm.intrinsics.empty : IsDataDescriptor(this.$Realm, d2) ? d2.value : undefined;
      if (oldVal1 === undefined || oldVal2 === undefined) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      invariant(oldVal1 instanceof Value);
      invariant(oldVal2 instanceof Value);
      let newVal1 = AbstractValue.createFromConditionalOp(this.$Realm, cond, this.$Realm.intrinsics.empty, oldVal1);
      let newVal2 = AbstractValue.createFromConditionalOp(this.$Realm, cond, oldVal2, this.$Realm.intrinsics.empty);
      let result1 = true;
      let result2 = true;
      if (d1 !== undefined) {
        d1 = d1.throwIfNotConcrete(this.$Realm);
        let newDesc1 = cloneDescriptor(d1);
        invariant(newDesc1);
        newDesc1 = newDesc1.throwIfNotConcrete(this.$Realm);
        newDesc1.value = newVal1;
        result1 = ob1.$DefineOwnProperty(P, newDesc1);
      }
      if (d2 !== undefined) {
        d2 = d2.throwIfNotConcrete(this.$Realm);
        let newDesc2 = cloneDescriptor(d2);
        invariant(newDesc2);
        newDesc2 = newDesc2.throwIfNotConcrete(this.$Realm);
        newDesc2.value = newVal2;
        result2 = ob2.$DefineOwnProperty(P, newDesc2);
      }
      if (result1 !== result2) {
        AbstractValue.reportIntrospectionError(this, P);
        throw new FatalError();
      }
      return result1;
    } else {
      let sawTrue = false;
      let sawFalse = false;
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        let d = cv.$GetOwnProperty(P);
        if (d === undefined) continue;
        if (!IsDataDescriptor(this.$Realm, d)) {
          AbstractValue.reportIntrospectionError(this, P);
          throw new FatalError();
        }
        let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", this, cv, this.expressionLocation);
        let dval = d.value;
        invariant(dval instanceof Value);
        let v = AbstractValue.createFromConditionalOp(this.$Realm, cond, this.$Realm.intrinsics.empty, dval);
        let newDesc = cloneDescriptor(d);
        invariant(newDesc);
        newDesc.value = v;
        if (cv.$DefineOwnProperty(P, newDesc)) sawTrue = true;
        else sawFalse = true;
      }
      if (sawTrue && sawFalse) {
        let error = new CompilerDiagnostic(
          "object could have both succeeded and failed updating",
          this.$Realm.currentLocation,
          "PP0041",
          "RecoverableError"
        );
        if (this.$Realm.handleError(error) === "Recover") {
          return true;
        }
      }
      return sawTrue;
    }
  }

  $OwnPropertyKeys(getOwnPropertyKeysEvenIfPartial?: boolean = false): Array<PropertyKeyValue> {
    if (this.values.isTop()) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
    let elements = this.values.getElements();
    if (elements.size === 1) {
      for (let cv of elements) {
        invariant(cv instanceof ObjectValue);
        return cv.$OwnPropertyKeys(getOwnPropertyKeysEvenIfPartial);
      }
      invariant(false);
    } else {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }
  }
}
