/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { Realm } from "../realm.js";
import type { Descriptor } from "../types.js";
import { IsArray } from "../methods/index.js";
import {
  AbstractValue,
  BooleanValue,
  ConcreteValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  NumberValue,
  ObjectValue,
  PrimitiveValue,
  ProxyValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { To } from "../singletons.js";
import invariant from "../invariant.js";
import { Logger } from "./logger.js";
import { PropertyDescriptor, AbstractJoinedDescriptor } from "../descriptors.js";

type TargetIntegrityCommand = "freeze" | "seal" | "preventExtensions" | "";

function hasAnyConfigurable(desc: void | Descriptor): boolean {
  if (!desc) {
    return false;
  }
  if (desc instanceof PropertyDescriptor) {
    return !!desc.configurable;
  }
  if (desc instanceof AbstractJoinedDescriptor) {
    return hasAnyConfigurable(desc.descriptor1) || hasAnyConfigurable(desc.descriptor2);
  }
  invariant(false, "internal slots aren't covered here");
}

function hasAnyWritable(desc: void | Descriptor): boolean {
  if (!desc) {
    return false;
  }
  if (desc instanceof PropertyDescriptor) {
    return desc.value !== undefined && !!desc.writable;
  }
  if (desc instanceof AbstractJoinedDescriptor) {
    return hasAnyWritable(desc.descriptor1) || hasAnyWritable(desc.descriptor2);
  }
  invariant(false, "internal slots aren't covered here");
}

export class HeapInspector {
  constructor(realm: Realm, logger: Logger) {
    this.realm = realm;
    this.logger = logger;
    this.ignoredProperties = new Map();
    this._targetIntegrityCommands = new Map();
  }

  realm: Realm;
  logger: Logger;
  ignoredProperties: Map<ObjectValue, Set<string>>;
  _targetIntegrityCommands: Map<ObjectValue, TargetIntegrityCommand>;

  getTargetIntegrityCommand(val: ObjectValue): TargetIntegrityCommand {
    let command = this._targetIntegrityCommands.get(val);
    if (command === undefined) {
      command = "";
      if (val instanceof ProxyValue) {
        // proxies don't participate in regular object freezing/sealing,
        // only their underlying proxied objects do
      } else {
        let extensible = val.$Extensible;
        if (!(extensible instanceof BooleanValue)) {
          this.logger.logError(
            val,
            "Object that might or might not be sealed or frozen are not supported in residual heap."
          );
        } else if (!extensible.value) {
          let anyWritable = false,
            anyConfigurable = false;
          for (let propertyBinding of val.properties.values()) {
            let desc = propertyBinding.descriptor;
            if (desc === undefined) continue; //deleted
            if (hasAnyConfigurable(desc)) anyConfigurable = true;
            else if (hasAnyWritable(desc)) anyWritable = true;
          }
          command = anyConfigurable ? "preventExtensions" : anyWritable ? "seal" : "freeze";
        }
      }
      this._targetIntegrityCommands.set(val, command);
    }
    return command;
  }

  static _integrityDescriptors = {
    "": { writable: true, configurable: true },
    preventExtensions: { writable: true, configurable: true },
    seal: { writable: true, configurable: false },
    freeze: { writable: false, configurable: false },
  };

  getTargetIntegrityDescriptor(val: ObjectValue): { writable: boolean, configurable: boolean } {
    return HeapInspector._integrityDescriptors[this.getTargetIntegrityCommand(val)];
  }

  static isLeaf(val: Value): boolean {
    if (val instanceof SymbolValue) {
      return false;
    }

    if (val instanceof AbstractValue) {
      if (val.hasIdentifier()) {
        return true;
      }

      if (
        val.$Realm.instantRender.enabled &&
        val.intrinsicName !== undefined &&
        val.intrinsicName.startsWith("__native")
      ) {
        // Never factor out multiple occurrences of InstantRender's __native... abstract functions.
        return true;
      }
    }

    if (val.isIntrinsic()) {
      return false;
    }

    return val instanceof PrimitiveValue;
  }

  // Object properties which have the default value can be ignored by the serializer.
  canIgnoreProperty(val: ObjectValue, key: string): boolean {
    let set = this.ignoredProperties.get(val);
    if (!set) {
      this.ignoredProperties.set(val, (set = this._getIgnoredProperties(val)));
    }
    return set.has(key);
  }

  _getIgnoredProperties(val: ObjectValue): Set<string> {
    let set: Set<string> = new Set();
    for (let [key, propertyBinding] of val.properties) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      if (this._canIgnoreProperty(val, key, desc)) set.add(key);
    }
    return set;
  }

  _canIgnoreProperty(val: ObjectValue, key: string, desc: Descriptor): boolean {
    if (!(desc instanceof PropertyDescriptor)) {
      // If we have a joined descriptor, there is at least one variant that isn't the same as
      // the target descriptor. Since the two descriptors won't be equal.
      return false;
    }

    let targetDescriptor = this.getTargetIntegrityDescriptor(val);

    if (IsArray(this.realm, val)) {
      if (
        key === "length" &&
        desc.writable === targetDescriptor.writable &&
        desc.enumerable !== true &&
        desc.configurable !== true
      ) {
        // length property has the correct descriptor values
        return true;
      }
    } else if (val instanceof FunctionValue) {
      if (key === "length") {
        if (desc.value === undefined) {
          this.logger.logError(val, "Functions with length accessor properties are not supported in residual heap.");
          // Rationale: .bind() would call the accessor, which might throw, mutate state, or do whatever...
        }
        // length property will be inferred already by the amount of parameters
        return (
          desc.writable !== true &&
          desc.enumerable !== true &&
          desc.configurable === targetDescriptor.configurable &&
          val.hasDefaultLength()
        );
      }

      if (key === "name") {
        // TODO #474: Make sure that we retain original function names. Or set name property.
        // Or ensure that nothing references the name property.
        // NOTE: with some old runtimes notably JSC, function names are not configurable
        // For now don't ignore the property if it is different from the function name.
        // I.e. if it was set explicitly in the code, retain it.
        if (
          desc.value !== undefined &&
          !this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION) &&
          !this.realm.isCompatibleWith("mobile") &&
          (desc.value instanceof AbstractValue ||
            (desc.value instanceof ConcreteValue &&
              val.__originalName !== undefined &&
              val.__originalName !== "" &&
              To.ToString(this.realm, desc.value) !== val.__originalName))
        )
          return false;
        return true;
      }

      // Properties `caller` and `arguments` are added to normal functions in non-strict mode to prevent TypeErrors.
      // Because they are autogenerated, they should be ignored.
      if (key === "arguments" || key === "caller") {
        invariant(val instanceof ECMAScriptSourceFunctionValue);
        if (
          !val.$Strict &&
          desc.writable === (!val.$Strict && targetDescriptor.writable) &&
          desc.enumerable !== true &&
          desc.configurable === targetDescriptor.configurable &&
          desc.value instanceof UndefinedValue &&
          val.$FunctionKind === "normal"
        )
          return true;
      }

      // ignore the `prototype` property when it's the right one
      if (key === "prototype") {
        if (
          desc.configurable !== true &&
          desc.enumerable !== true &&
          desc.writable === targetDescriptor.writable &&
          desc.value instanceof ObjectValue &&
          desc.value.originalConstructor === val
        ) {
          return true;
        }
      }
    } else {
      let kind = val.getKind();
      switch (kind) {
        case "RegExp":
          if (
            key === "lastIndex" &&
            desc.writable === targetDescriptor.writable &&
            desc.enumerable !== true &&
            desc.configurable !== true
          ) {
            // length property has the correct descriptor values
            let v = desc.value;
            return v instanceof NumberValue && v.value === 0;
          }
          break;
        default:
          break;
      }
    }

    if (key === "constructor") {
      if (
        desc.configurable === targetDescriptor.configurable &&
        desc.enumerable !== true &&
        desc.writable === targetDescriptor.writable &&
        desc.value === val.originalConstructor
      )
        return true;
    }

    return false;
  }

  static getPropertyValue(val: ObjectValue, name: string): void | Value {
    let prototypeBinding = val.properties.get(name);
    if (prototypeBinding === undefined) return undefined;
    let prototypeDesc = prototypeBinding.descriptor;
    if (prototypeDesc === undefined) return undefined;
    invariant(prototypeDesc instanceof PropertyDescriptor);
    invariant(prototypeDesc.value === undefined || prototypeDesc.value instanceof Value);
    return prototypeDesc.value;
  }

  isDefaultPrototype(prototype: ObjectValue): boolean {
    if (
      prototype.symbols.size !== 0 ||
      prototype.$Prototype !== this.realm.intrinsics.ObjectPrototype ||
      prototype.$Extensible.mightNotBeTrue()
    ) {
      return false;
    }
    let foundConstructor = false;
    for (let name of prototype.properties.keys())
      if (name === "constructor" && HeapInspector.getPropertyValue(prototype, name) === prototype.originalConstructor)
        foundConstructor = true;
      else return false;
    return foundConstructor;
  }
}
