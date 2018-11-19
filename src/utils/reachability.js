/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

// Implements routines to find reachable values for the purpose of leaked value analysis

import type { Realm } from "../realm.js";
import type { Descriptor, PropertyBinding, ObjectKind } from "../types.js";
import {
  DeclarativeEnvironmentRecord,
  FunctionEnvironmentRecord,
  ObjectEnvironmentRecord,
  GlobalEnvironmentRecord,
} from "../environment.js";
import {
  AbstractValue,
  BoundFunctionValue,
  ECMAScriptSourceFunctionValue,
  EmptyValue,
  FunctionValue,
  NativeFunctionValue,
  ObjectValue,
  PrimitiveValue,
  ProxyValue,
  Value,
} from "../values/index.js";
import * as t from "@babel/types";
import traverse from "@babel/traverse";
import type { BabelTraversePath } from "@babel/traverse";
import type { Binding } from "../environment.js";
import invariant from "../invariant.js";
import { PropertyDescriptor, AbstractJoinedDescriptor } from "../descriptors.js";

type FunctionBindingVisitorInfo = {
  unboundReads: Set<string>,
  unboundWrites: Set<string>,
};

function visitName(
  path: BabelTraversePath,
  state: FunctionBindingVisitorInfo,
  name: string,
  read: boolean,
  write: boolean
): void {
  // Is the name bound to some local identifier? If so, we don't need to do anything
  if (path.scope.hasBinding(name, /*noGlobals*/ true)) return;

  // Otherwise, let's record that there's an unbound identifier
  if (read) state.unboundReads.add(name);
  if (write) state.unboundWrites.add(name);
}

// Why are these paths ignored?
function ignorePath(path: BabelTraversePath): boolean {
  let parent = path.parent;
  return t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent);
}

let FunctionBindingVisitor = {
  _readOnly: false,
  ReferencedIdentifier(path: BabelTraversePath, state: FunctionBindingVisitorInfo): void {
    if (ignorePath(path)) return;

    let innerName = path.node.name;
    if (innerName === "arguments") {
      return;
    }
    visitName(path, state, innerName, true, false);
  },
  AssignmentExpression(path: BabelTraversePath, state: FunctionBindingVisitorInfo): void {
    let doesRead = path.node.operator !== "=";
    for (let name in path.getBindingIdentifiers()) {
      visitName(path, state, name, doesRead, !this._readOnly);
    }
  },
  UpdateExpression(path: BabelTraversePath, state: FunctionBindingVisitorInfo): void {
    let doesRead = path.node.operator !== "=";
    for (let name in path.getBindingIdentifiers()) {
      visitName(path, state, name, doesRead, !this._readOnly);
    }
  },
};

export class ReachabilityImplementation {
  computeReachableObjectsAndBindings(
    realm: Realm,
    rootValue: Value,
    filterValue: Value => boolean,
    readOnly?: boolean
  ): [Set<ObjectValue>, Set<Binding>] {
    invariant(realm.isInPureScope());

    let reachableObjects: Set<ObjectValue> = new Set();
    let reachableBindings: Set<Binding> = new Set();
    let visitedValues: Set<Value> = new Set();
    computeFromValue(rootValue);

    return [reachableObjects, reachableBindings];

    function computeFromBindings(
      func: FunctionValue,
      nonLocalReadBindings: Set<string>,
      nonLocalWriteBindings: Set<string>
    ): void {
      invariant(func instanceof ECMAScriptSourceFunctionValue);
      let environment = func.$Environment;
      while (environment) {
        let record = environment.environmentRecord;
        if (record instanceof ObjectEnvironmentRecord) computeFromValue(record.object);
        else if (record instanceof DeclarativeEnvironmentRecord || record instanceof FunctionEnvironmentRecord) {
          computeFromDeclarativeEnvironmentRecord(record, nonLocalReadBindings, nonLocalWriteBindings);
          if (record instanceof FunctionEnvironmentRecord) {
            // We only ascend further in environments if the function is whitelisted
            let fn = record.$FunctionObject;
            if (!filterValue(fn)) break;
          }
        } else if (record instanceof GlobalEnvironmentRecord) {
          // Reachability does not enumerate global bindings and objects.
          // Prepack assumes that external functions will not mutate globals
          // and that any references to globals need their final values.
          break;
        }
        environment = environment.parent;
      }
    }
    function computeFromDeclarativeEnvironmentRecord(
      record: DeclarativeEnvironmentRecord,
      nonLocalReadBindings: Set<string>,
      nonLocalWriteBindings: Set<string>
    ): void {
      let environmentBindings = record.bindings;
      for (let bindingName of Object.keys(environmentBindings)) {
        let binding = environmentBindings[bindingName];
        invariant(binding !== undefined);
        let readFound = nonLocalReadBindings.delete(bindingName);
        let writeFound = readOnly !== undefined && readOnly === false && nonLocalWriteBindings.delete(bindingName);

        // Check what undefined could mean here, besides absent binding
        // #2446
        let value = binding.value;
        if (readFound && value !== undefined) {
          computeFromValue(value);
        }

        if (readFound || writeFound) {
          reachableBindings.add(binding);
        }
      }
    }
    function computeFromAbstractValue(value: AbstractValue): void {
      if (value.kind === "conditional") {
        // For a conditional, we only have to visit each case. Not the condition itself.
        computeFromValue(value.args[1]);
        computeFromValue(value.args[2]);
        return;
      }

      if (value.values.isTop()) {
        for (let arg of value.args) {
          computeFromValue(arg);
        }
      } else {
        // If we know which object this might be, then leak each of them.
        for (let element of value.values.getElements()) {
          computeFromValue(element);
        }
      }
    }
    function computeFromProxyValue(value: ProxyValue): void {
      computeFromValue(value.$ProxyTarget);
      computeFromValue(value.$ProxyHandler);
    }
    function computeFromValue(value: Value): void {
      invariant(value !== undefined);
      if (value instanceof EmptyValue || value instanceof PrimitiveValue) {
        visit(value);
      } else if (value instanceof AbstractValue) {
        ifNotVisited(value, computeFromAbstractValue);
      } else if (value instanceof FunctionValue) {
        ifNotVisited(value, computeFromFunctionValue);
      } else if (value instanceof ObjectValue) {
        ifNotVisited(value, computeFromObjectValue);
      } else if (value instanceof ProxyValue) {
        ifNotVisited(value, computeFromProxyValue);
      }
    }
    function computeFromObjectValue(value: Value): void {
      invariant(value instanceof ObjectValue);

      let kind = value.getKind();
      computeFromObjectProperties(value, kind);

      switch (kind) {
        case "RegExp":
        case "Number":
        case "String":
        case "Boolean":
        case "ReactElement":
        case "ArrayBuffer":
        case "Array":
          break;
        case "Date":
          let dateValue = value.$DateValue;
          invariant(dateValue !== undefined);
          computeFromValue(dateValue);
          break;
        case "Float32Array":
        case "Float64Array":
        case "Int8Array":
        case "Int16Array":
        case "Int32Array":
        case "Uint8Array":
        case "Uint16Array":
        case "Uint32Array":
        case "Uint8ClampedArray":
        case "DataView":
          let buf = value.$ViewedArrayBuffer;
          invariant(buf !== undefined);
          computeFromValue(buf);
          break;
        case "Map":
        case "WeakMap":
          ifNotVisited(value, computeFromMap);
          break;
        case "Set":
        case "WeakSet":
          ifNotVisited(value, computeFromSet);
          break;
        default:
          invariant(kind === "Object", `Object of kind ${kind} is not supported in calls to abstract functions.`);
          invariant(
            value.$ParameterMap === undefined,
            `Arguments object is not supported in calls to abstract functions.`
          );
          break;
      }
      if (!reachableObjects.has(value)) reachableObjects.add(value);
    }
    function computeFromDescriptor(descriptor: Descriptor): void {
      if (descriptor === undefined) {
      } else if (descriptor instanceof PropertyDescriptor) {
        if (descriptor.value !== undefined) computeFromValue(descriptor.value);
        if (descriptor.get !== undefined) computeFromValue(descriptor.get);
        if (descriptor.set !== undefined) computeFromValue(descriptor.set);
      } else if (descriptor instanceof AbstractJoinedDescriptor) {
        computeFromValue(descriptor.joinCondition);
        if (descriptor.descriptor1 !== undefined) computeFromDescriptor(descriptor.descriptor1);
        if (descriptor.descriptor2 !== undefined) computeFromDescriptor(descriptor.descriptor2);
      } else {
        invariant(false, "unknown descriptor");
      }
    }
    function computeFromObjectPropertyBinding(binding: PropertyBinding): void {
      let descriptor = binding.descriptor;
      if (descriptor === undefined) return; //deleted
      computeFromDescriptor(descriptor);
    }

    function computeFromObjectProperties(obj: ObjectValue, kind?: ObjectKind): void {
      // symbol properties
      for (let [, propertyBindingValue] of obj.symbols) {
        invariant(propertyBindingValue);
        computeFromObjectPropertyBinding(propertyBindingValue);
      }

      // string properties
      for (let [, propertyBindingValue] of obj.properties) {
        invariant(propertyBindingValue);
        computeFromObjectPropertyBinding(propertyBindingValue);
      }

      // unkonwn property
      if (obj.unknownProperty !== undefined && obj.unknownProperty.descriptor !== undefined) {
        computeFromDescriptor(obj.unknownProperty.descriptor);
      }

      // prototype
      if (obj.$Prototype !== undefined) computeFromObjectPrototype(obj);
    }
    function computeFromObjectPrototype(obj: ObjectValue) {
      computeFromValue(obj.$Prototype);
    }
    function computeFromFunctionValue(fn: FunctionValue) {
      computeFromObjectProperties(fn);

      if (fn instanceof BoundFunctionValue) {
        computeFromValue(fn.$BoundTargetFunction);
        computeFromValue(fn.$BoundThis);
        for (let boundArg of fn.$BoundArguments) computeFromValue(boundArg);
        return;
      }

      invariant(
        !(fn instanceof NativeFunctionValue),
        "all native function values should have already been created outside this pure function"
      );

      let [nonLocalReadBindings, nonLocalWriteBindings] = parsedBindingsOfFunction(fn);
      computeFromBindings(fn, nonLocalReadBindings, nonLocalWriteBindings);
    }

    function computeFromMap(val: ObjectValue): void {
      let kind = val.getKind();

      let entries;
      if (kind === "Map") {
        entries = val.$MapData;
      } else {
        invariant(kind === "WeakMap");
        entries = val.$WeakMapData;
      }
      invariant(entries !== undefined);
      let len = entries.length;

      for (let i = 0; i < len; i++) {
        let entry = entries[i];
        let key = entry.$Key;
        let value = entry.$Value;
        if (key === undefined || value === undefined) continue;
        computeFromValue(key);
        computeFromValue(value);
      }
    }

    function computeFromSet(val: ObjectValue): void {
      let kind = val.getKind();

      let entries;
      if (kind === "Set") {
        entries = val.$SetData;
      } else {
        invariant(kind === "WeakSet");
        entries = val.$WeakSetData;
      }
      invariant(entries !== undefined);
      let len = entries.length;

      for (let i = 0; i < len; i++) {
        let entry = entries[i];
        if (entry === undefined) continue;

        computeFromValue(entry);
      }
    }

    function parsedBindingsOfFunction(func: FunctionValue): [Set<string>, Set<string>] {
      let functionInfo = {
        unboundReads: new Set(),
        unboundWrites: new Set(),
      };

      invariant(func instanceof ECMAScriptSourceFunctionValue);

      let formalParameters = func.$FormalParameters;
      invariant(formalParameters != null);

      let code = func.$ECMAScriptCode;
      invariant(code != null);

      FunctionBindingVisitor._readOnly = !!readOnly;

      traverse(
        t.file(t.program([t.expressionStatement(t.functionExpression(null, formalParameters, code))])),
        FunctionBindingVisitor,
        null,
        functionInfo
      );
      traverse.cache.clear();

      return [functionInfo.unboundReads, functionInfo.unboundWrites];
    }
    function ifNotVisited<T>(value: T, computeFrom: T => void): void {
      if (!(value instanceof Value) || (filterValue(value) && !visitedValues.has(value))) {
        visitedValues.add(value);
        computeFrom(value);
      }
    }
    function visit(value: Value): void {
      visitedValues.add(value);
    }
  }
}
