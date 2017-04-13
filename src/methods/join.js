/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeBlockStatement } from "babel-types";
import type { Binding } from "../environment.js";
import type { Bindings, Effects, EvaluationResult, PropertyBindings, CreatedObjects, Realm } from "../realm.js";
import type { Descriptor, PropertyBinding } from "../types.js";

import { AbruptCompletion, BreakCompletion, Completion, ContinueCompletion,
   PossiblyNormalCompletion, JoinedAbruptCompletions,
   ReturnCompletion, IntrospectionThrowCompletion, ThrowCompletion } from "../completions.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { Reference } from "../environment.js";
import { cloneDescriptor, IsDataDescriptor, StrictEqualityComparison } from "../methods/index.js";
import { construct_empty_effects } from "../realm.js";
import { Generator } from "../utils/generator.js";
import type { SerializationContext } from "../utils/generator.js";
import { AbstractValue, Value } from "../values/index.js";

import invariant from "../invariant.js";
import * as t from "babel-types";

export function joinPossiblyNormalCompletions(
    realm: Realm, pnc: PossiblyNormalCompletion, c: PossiblyNormalCompletion): PossiblyNormalCompletion {
    let empty_effects = construct_empty_effects(realm);
    if (pnc.consequent instanceof AbruptCompletion) {
      if (pnc.alternate instanceof Value) {
        return new PossiblyNormalCompletion(pnc.joinCondition,
           pnc.consequent, pnc.consequentEffects, c, empty_effects);
      }
      invariant(pnc.alternate instanceof PossiblyNormalCompletion);
      let new_alternate = joinPossiblyNormalCompletions(realm, pnc.alternate, c);
      return new PossiblyNormalCompletion(pnc.joinCondition,
         pnc.consequent, pnc.consequentEffects, new_alternate, empty_effects);
    } else {
      invariant(pnc.alternate instanceof AbruptCompletion);
      if (pnc.consequent instanceof Value) {
        return new PossiblyNormalCompletion(pnc.joinCondition,
           c, empty_effects, pnc.alternate, pnc.alternateEffects);
      }
      invariant(pnc.consequent instanceof PossiblyNormalCompletion);
      let new_consequent = joinPossiblyNormalCompletions(realm, pnc.consequent, c);
      return new PossiblyNormalCompletion(pnc.joinCondition,
         new_consequent, empty_effects, pnc.alternate, pnc.alternateEffects);
    }
}

export function joinPossiblyNormalCompletionWithAbruptCompletion(
    realm: Realm, pnc: PossiblyNormalCompletion, ac: AbruptCompletion, e: Effects): Effects {
  if (pnc.consequent instanceof AbruptCompletion) {
    if (pnc.alternate instanceof Value)
      return joinEffects(realm, pnc.joinCondition, pnc.consequentEffects, e);
    invariant(pnc.alternate instanceof PossiblyNormalCompletion);
    let alternate_effects = joinPossiblyNormalCompletionWithAbruptCompletion(realm, pnc.alternate, ac, e);
    invariant(pnc.consequent instanceof AbruptCompletion);
    return joinEffects(realm, pnc.joinCondition, pnc.consequentEffects, alternate_effects);
  } else {
    invariant(pnc.alternate instanceof AbruptCompletion);
    if (pnc.consequent instanceof Value)
      return joinEffects(realm, pnc.joinCondition, e, pnc.alternateEffects);
    invariant(pnc.consequent instanceof PossiblyNormalCompletion);
    let consequent_effects = joinPossiblyNormalCompletionWithAbruptCompletion(realm, pnc.consequent, ac, e);
    invariant(pnc.alternate instanceof AbruptCompletion);
    return joinEffects(realm, pnc.joinCondition, consequent_effects, pnc.alternateEffects);
  }
}

export function joinEffectsAndRemoveNestedReturnCompletions(
    realm: Realm, c: Completion | Value, e: Effects, nested_effects?: Effects): Effects {
  if (c instanceof Value)
    return e;
  if (c instanceof AbruptCompletion) {
    invariant(nested_effects !== undefined);
    return nested_effects;
  }
  if (c instanceof PossiblyNormalCompletion) {
    let e1 = joinEffectsAndRemoveNestedReturnCompletions(realm, c.consequent, e, c.consequentEffects);
    let e2 = joinEffectsAndRemoveNestedReturnCompletions(realm, c.alternate, e, c.alternateEffects);
    if (e1[0] instanceof ReturnCompletion) {
      if (!(e2[0] instanceof ReturnCompletion)) {
        invariant(e2[0] instanceof Value); // otherwise c cannot possibly be normal
        e2[0] = new ReturnCompletion(realm.intrinsics.undefined);
      }
      return joinEffects(realm, c.joinCondition, e1, e2);
    } else if (e2[0] instanceof ReturnCompletion) {
      invariant(e1[0] instanceof Value); // otherwise c cannot possibly be normal
      e1[0] = new ReturnCompletion(realm.intrinsics.undefined);
      return joinEffects(realm, c.joinCondition, e1, e2);
    } else {
      return AbstractValue.throwIntrospectionError(c.joinCondition);
    }
  }
  invariant(false);
}

export function joinEffects(realm: Realm, joinCondition: AbstractValue,
    e1: Effects, e2: Effects): Effects {
  let [result1, gen1, bindings1, properties1, createdObj1] = e1;
  let [result2, gen2, bindings2, properties2, createdObj2] = e2;

  if (result1 instanceof IntrospectionThrowCompletion) return e1;
  if (result2 instanceof IntrospectionThrowCompletion) return e2;
  let result = joinResults(realm, joinCondition, result1, result2, e1, e2);
  if (result1 instanceof AbruptCompletion) {
    if (!(result2 instanceof AbruptCompletion)) {
      invariant(result instanceof PossiblyNormalCompletion);
      return [result, gen2, bindings2, properties2, createdObj2];
    }
  } else if (result2 instanceof AbruptCompletion) {
    invariant(result instanceof PossiblyNormalCompletion);
    return [result, gen1, bindings1, properties1, createdObj1];
  }

  let bindings = joinBindings(realm, joinCondition, bindings1, bindings2);
  let properties = joinPropertyBindings(realm, joinCondition,
    properties1, properties2, createdObj1, createdObj2);
  let createdObjects = new Set();
  createdObj1.forEach((o) => {
    createdObjects.add(o);
  });
  createdObj2.forEach((o) => {
    createdObjects.add(o);
  });

  let generator = joinGenerators(realm, joinCondition, gen1, gen2, result1, result2);

  return [result, generator, bindings, properties, createdObjects];
}

function joinResults(realm: Realm, joinCondition: AbstractValue,
    result1: EvaluationResult, result2: EvaluationResult,
    e1: Effects, e2: Effects): EvaluationResult {
  function getAbstractValue(v1: void | Value, v2: void | Value): AbstractValue {
    return joinValuesAsConditional(realm, joinCondition, v1, v2);
  }
  if (result1 instanceof Reference || result2 instanceof Reference)
    return AbstractValue.throwIntrospectionError(joinCondition);
  if (result1 instanceof BreakCompletion && result2 instanceof BreakCompletion &&
      result1.target === result2.target) {
    return new BreakCompletion(realm.intrinsics.empty, result1.target);
  }
  if (result1 instanceof ContinueCompletion && result2 instanceof ContinueCompletion &&
      result1.target === result2.target) {
    return new ContinueCompletion(realm.intrinsics.empty, result1.target);
  }
  if (result1 instanceof ReturnCompletion && result2 instanceof ReturnCompletion) {
    let val = joinValues(realm, result1.value, result2.value, getAbstractValue);
    return new ReturnCompletion(val);
  }
  if (result1 instanceof ThrowCompletion && result2 instanceof ThrowCompletion) {
    let val = joinValues(realm, result1.value, result2.value, getAbstractValue);
    return new ThrowCompletion(val);
  }
  if (result1 instanceof AbruptCompletion && result2 instanceof AbruptCompletion) {
    return new JoinedAbruptCompletions(realm, joinCondition, result1, e1, result2, e2);
  }
  if (result1 instanceof Value && result2 instanceof Value)
    return joinValues(realm, result1, result2, getAbstractValue);
  return new PossiblyNormalCompletion(joinCondition, result1, e1, result2, e2);
}

function joinGenerators(realm: Realm, joinCondition: AbstractValue,
    generator1: Generator, generator2: Generator,
    result1: EvaluationResult, result2: EvaluationResult): Generator {
  let result = new Generator(realm);
  if (!generator1.empty() || !generator2.empty()) {
    result.body.push({
      args: [joinCondition],
      buildNode: function ([cond], context) {
        let block1 = generator1.empty() ? null : serializeBody(generator1, context);
        let block2 = generator2.empty() ? null : serializeBody(generator2, context);
        if (block1) return t.ifStatement(cond, block1, block2);
        invariant(block2);
        return t.ifStatement(t.unaryExpression("!", cond), block2);
      }
    });
  }
  return result;
}

function serializeBody(
  generator: Generator,
  context: SerializationContext
): BabelNodeBlockStatement {
  let statements = context.startBody();
  generator.serialize(statements, context);
  context.endBody(statements);
  return t.blockStatement(statements);
}

// Creates a single map that joins together maps m1 and m2 using the given join
// operator. If an entry is present in one map but not the other, the missing
// entry is treated as if it were there and its value were undefined.
export function joinMaps<K, V>(
    m1: Map<K, void | V>,
    m2: Map<K, void | V>,
    join: (K, void | V, void | V) => V): Map<K, void | V> {
  let m3 : Map<K, void | V> = new Map();
  m1.forEach(
    (val1, key, map1) => {
      let val2 = m2.get(key);
      let val3 = join(key, val1, val2);
      m3.set(key, val3);
    }
  );
  m2.forEach(
    (val2, key, map2) => {
      if (!m1.has(key)) {
        m3.set(key, join(key, undefined, val2));
      }
    }
  );
  return m3;
}

// Creates a single map that has an key, value pair for the union of the key
// sets of m1 and m2. The value of a pair is the join of m1[key] and m2[key]
// where the join is defined to be just m1[key] if m1[key] === m2[key] and
// and abstract value with expression "joinCondition ? m1[key] : m2[key]" if not.
export function joinBindings(realm: Realm, joinCondition: AbstractValue,
     m1: Bindings, m2: Bindings): Bindings {

  function getAbstractValue(v1: void | Value, v2: void | Value): AbstractValue{
    return joinValuesAsConditional(realm, joinCondition, v1, v2);
  }
  function join(b: Binding, v1: void | Value, v2: void | Value) {
    if (v1 === undefined) v1 = b.value;
    if (v2 === undefined) v2 = b.value;
    return joinValues(realm, v1, v2, getAbstractValue);
  }
  return joinMaps(m1, m2, join);
}

// If v1 is known and defined and v1 === v2 return v1,
// otherwise return getAbstractValue(v1, v2)
export function joinValues(realm: Realm, v1: void | Value, v2: void | Value,
  getAbstractValue: (void | Value, void | Value) => AbstractValue): Value {
  if (v1 !== undefined && v2 !== undefined &&
      !(v1 instanceof AbstractValue) && !(v2 instanceof AbstractValue) &&
      StrictEqualityComparison(realm, v1.throwIfNotConcrete(), v2.throwIfNotConcrete())) {
    return v1;
  } else {
    return getAbstractValue(v1, v2);
  }
}

export function joinValuesAsConditional(
    realm: Realm, condition: AbstractValue, v1: void | Value, v2: void | Value): AbstractValue {
  let types = TypesDomain.joinValues(v1, v2);
  let values = ValuesDomain.joinValues(realm, v1, v2);
  return realm.createAbstract(types, values,
    [condition, v1 || realm.intrinsics.undefined, v2 || realm.intrinsics.undefined],
    (args) => t.conditionalExpression(args[0], args[1], args[2]));
}

export function joinPropertyBindings(realm: Realm, joinCondition: AbstractValue,
    m1: PropertyBindings, m2: PropertyBindings,
    c1: CreatedObjects, c2: CreatedObjects): PropertyBindings {

  function getAbstractValue(v1: void | Value, v2: void | Value): AbstractValue{
    return joinValuesAsConditional(realm, joinCondition, v1, v2);
  }
  function join(b: PropertyBinding, d1: void | Descriptor, d2: void | Descriptor) {
    // If the PropertyBinding object has been freshly allocated do not join
    if (d1 === undefined) {
      if (c2.has(b.object)) return d2; // no join
      if (b.descriptor !== undefined && m1.has(b)) {
        // property was deleted
        d1 = cloneDescriptor(b.descriptor);
        invariant(d1 !== undefined);
        d1.value = realm.intrinsics.empty;
      } else {
        // no write to property
        d1 = b.descriptor; //Get value of property before the split
      }
    }
    if (d2 === undefined) {
      if (c1.has(b.object)) return d1; // no join
      if (b.descriptor !== undefined && m2.has(b)) {
        // property was deleted
        d2 = cloneDescriptor(b.descriptor);
        invariant(d2 !== undefined);
        d2.value = realm.intrinsics.empty;
      } else {
        // no write to property
        d2 = b.descriptor; //Get value of property before the split
      }
    }
    return joinDescriptors(realm, d1, d2, getAbstractValue);
  }
  return joinMaps(m1, m2, join);
}

// Returns a field by field join of two descriptors.
// Descriptors with get/set are not yet supported.
export function joinDescriptors(realm: Realm,
    d1: void | Descriptor, d2: void | Descriptor,
    getAbstractValue: (void | Value, void | Value) => AbstractValue): void | Descriptor {
  function clone_with_abstract_value(d: Descriptor) {
    if (!IsDataDescriptor(realm, d))
      throw new Error("TODO: join computed properties");
    let dc = cloneDescriptor(d);
    invariant(dc !== undefined);
    dc.value = getAbstractValue(d.value, undefined);
    return dc;
  }
  if (d1 === undefined) {
    if (d2 === undefined) return undefined;
    // d2 is a new property created in only one branch, join with undefined
    return clone_with_abstract_value(d2);
  } else if (d2 === undefined) {
    // d1 is a new property created in only one branch, join with undefined
    return clone_with_abstract_value(d1);
  } else {
    let d3 : Descriptor = { };
    let writable = joinBooleans(d1.writable, d2.writable);
    if (writable !== undefined) d3.writable = writable;
    let enumerable = joinBooleans(d1.enumerable, d2.enumerable);
    if (enumerable !== undefined) d3.enumerable = enumerable;
    let configurable = joinBooleans(d1.configurable, d2.configurable);
    if (configurable !== undefined) d3.configurable = configurable;
    if (IsDataDescriptor(realm, d1) || IsDataDescriptor(realm, d2))
      d3.value = joinValues(realm, d1.value, d2.value, getAbstractValue);
    if (d1.hasOwnProperty("get") || d2.hasOwnProperty("get"))
      throw new Error("TODO: join callables");
    if (d1.hasOwnProperty("set") || d2.hasOwnProperty("set"))
      throw new Error("TODO: join callables");
    return d3;
  }
}

// Returns v1 || v2, treating undefined as false,
// but returns undefined if both v1 and v2 are undefined.
export function joinBooleans(v1: void | boolean, v2: void | boolean): void | boolean {
  if (v1 === undefined) {
    return v2;
  } else if (v2 === undefined) {
    return v1;
  } else {
    return v1 || v2;
  }
}
