/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import { FatalError } from "../errors.js";
import type { Descriptor, PropertyBinding } from "../types.js";
import { ToLength, IsArray, Get } from "../methods/index.js";
import {
  BoundFunctionValue,
  ProxyValue,
  SymbolValue,
  AbstractValue,
  EmptyValue,
  FunctionValue,
  Value,
  ObjectValue,
  NativeFunctionValue,
  UndefinedValue,
} from "../values/index.js";
import * as t from "babel-types";
import type {
  BabelNodeExpression,
  BabelNodeStatement,
  BabelNodeIdentifier,
  BabelNodeBlockStatement,
  BabelNodeLVal,
  BabelNodeMemberExpression,
  BabelVariableKind,
  BabelNodeFile,
} from "babel-types";
import { Generator, PreludeGenerator, NameGenerator } from "../utils/generator.js";
import type { SerializationContext } from "../utils/generator.js";
import invariant from "../invariant.js";
import type { SerializedBinding, VisitedBinding, FunctionInfo, FunctionInstance } from "./types.js";
import { TimingStatistics, SerializerStatistics, type VisitedBindings } from "./types.js";
import { Logger } from "./logger.js";
import { Modules } from "./modules.js";
import { ResidualHeapInspector } from "./ResidualHeapInspector.js";
import { ResidualFunctions } from "./ResidualFunctions.js";
import type { Scope } from "./ResidualHeapVisitor.js";
import { factorifyObjects } from "./factorify.js";
import { voidExpression, emptyExpression, constructorExpression, protoExpression } from "../utils/internalizer.js";
import { Emitter } from "./Emitter.js";
import { ResidualHeapValueIdentifiers } from "./ResidualHeapValueIdentifiers.js";

export class ResidualHeapSerializer {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    residualHeapValueIdentifiers: ResidualHeapValueIdentifiers,
    residualHeapInspector: ResidualHeapInspector,
    residualValues: Map<Value, Set<Scope>>,
    residualFunctionBindings: Map<FunctionValue, VisitedBindings>,
    residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>
  ) {
    this.realm = realm;
    this.logger = logger;
    this.modules = modules;
    this.residualHeapValueIdentifiers = residualHeapValueIdentifiers;

    let realmGenerator = this.realm.generator;
    invariant(realmGenerator);
    this.generator = realmGenerator;
    let realmPreludeGenerator = this.realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;

    this.declarativeEnvironmentRecordsBindings = new Map();
    this.prelude = [];
    this.descriptors = new Map();
    this.needsEmptyVar = false;
    this.needsAuxiliaryConstructor = false;
    this.valueNameGenerator = this.preludeGenerator.createNameGenerator("_");
    this.descriptorNameGenerator = this.preludeGenerator.createNameGenerator("$$");
    this.factoryNameGenerator = this.preludeGenerator.createNameGenerator("$_");
    this.requireReturns = new Map();
    this.statistics = new SerializerStatistics();
    this.serializedValues = new Set();
    this.residualFunctions = new ResidualFunctions(
      this.realm,
      this.statistics,
      this.modules,
      this.requireReturns,
      {
        getLocation: value => this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCountOptional(value),
        createLocation: () => {
          let location = t.identifier(this.valueNameGenerator.generate("initialized"));
          this.mainBody.push(t.variableDeclaration("var", [t.variableDeclarator(location)]));
          return location;
        },
      },
      this.prelude,
      this.preludeGenerator.createNameGenerator("__init_"),
      this.factoryNameGenerator,
      this.preludeGenerator.createNameGenerator("__scope_"),
      residualFunctionInfos
    );
    this.emitter = new Emitter(this.residualFunctions);
    this.mainBody = this.emitter.getBody();
    this.residualHeapInspector = residualHeapInspector;
    this.residualValues = residualValues;
    this.residualFunctionBindings = residualFunctionBindings;
    this.residualFunctionInfos = residualFunctionInfos;
  }

  emitter: Emitter;
  declarativeEnvironmentRecordsBindings: Map<VisitedBinding, SerializedBinding>;
  functions: Map<BabelNodeBlockStatement, Array<FunctionInstance>>;
  functionInstances: Array<FunctionInstance>;
  prelude: Array<BabelNodeStatement>;
  body: Array<BabelNodeStatement>;
  mainBody: Array<BabelNodeStatement>;
  realm: Realm;
  preludeGenerator: PreludeGenerator;
  generator: Generator;
  descriptors: Map<string, BabelNodeIdentifier>;
  needsEmptyVar: boolean;
  needsAuxiliaryConstructor: boolean;
  valueNameGenerator: NameGenerator;
  descriptorNameGenerator: NameGenerator;
  factoryNameGenerator: NameGenerator;
  logger: Logger;
  modules: Modules;
  residualHeapValueIdentifiers: ResidualHeapValueIdentifiers;
  requireReturns: Map<number | string, BabelNodeExpression>;
  statistics: SerializerStatistics;
  timingStats: TimingStatistics;
  residualHeapInspector: ResidualHeapInspector;
  residualValues: Map<Value, Set<Scope>>;
  residualFunctionBindings: Map<FunctionValue, VisitedBindings>;
  residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  serializedValues: Set<Value>;
  residualFunctions: ResidualFunctions;

  // Configures all mutable aspects of an object, in particular:
  // symbols, properties, prototype.
  // For every created object that corresponds to a value,
  // this function should be invoked once.
  // Thus, as a side effects, we gather statistics here on all emitted objects.
  _emitObjectProperties(
    obj: ObjectValue,
    properties: Map<string, PropertyBinding> = obj.properties,
    objectPrototypeAlreadyEstablished: boolean = false
  ) {
    for (let [symbol, propertyBinding] of obj.symbols) {
      // TODO #22: serialize symbols
      invariant(symbol instanceof SymbolValue);
      invariant(propertyBinding.descriptor);
      let propValue = propertyBinding.descriptor.value;
      this.serializeValue(symbol);
      let mightHaveBeenDeleted = symbol.mightHaveBeenDeleted();
      invariant(
        mightHaveBeenDeleted === false,
        "Conditionally deleting a symbol property of an object is not supported yet"
      );
      this.emitter.emitNowOrAfterWaitingForDependencies([symbol, obj], () => {
        this._assignProperty(
          () => {
            let serializedSymbol = this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(symbol);
            return t.memberExpression(
              this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(obj),
              serializedSymbol,
              true
            ); //should simplify to myObj[sym]
          },
          () => {
            invariant(propValue instanceof Value);
            return this.serializeValue(propValue);
          }, //this is the value
          mightHaveBeenDeleted //in the simplified version this is not necessary (should always be false)
        );
      });
    }

    // inject properties
    for (let [key, propertyBinding] of properties) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      if (this.residualHeapInspector.canIgnoreProperty(obj, key)) continue;
      invariant(desc !== undefined);
      this.emitter.emitNowOrAfterWaitingForDependencies(this._getDescriptorValues(desc).concat(obj), () => {
        invariant(desc !== undefined);
        return this._emitProperty(obj, key, desc);
      });
    }

    // inject properties with computed names
    if (obj.unknownProperty !== undefined) {
      let desc = obj.unknownProperty.descriptor;
      if (desc !== undefined) {
        let val = desc.value;
        invariant(val instanceof AbstractValue);
        this.emitter.emitNowOrAfterWaitingForDependencies(this._getNestedAbstractValues(val, [obj]), () => {
          invariant(val instanceof AbstractValue);
          this._emitPropertiesWithComputedNames(obj, val);
        });
      }
    }

    // prototype
    this._emitObjectPrototype(obj, objectPrototypeAlreadyEstablished);
    if (obj instanceof FunctionValue) this._emitConstructorPrototype(obj);

    this.statistics.objects++;
    this.statistics.objectProperties += obj.properties.size;
  }

  _emitObjectPrototype(obj: ObjectValue, objectPrototypeAlreadyEstablished: boolean) {
    let kind = obj.getKind();
    let proto = obj.$Prototype;
    if (objectPrototypeAlreadyEstablished) {
      // Emitting an assertion. This can be removed in the future, or put under a DEBUG flag.
      this.emitter.emitNowOrAfterWaitingForDependencies([proto, obj], () => {
        invariant(proto);
        let serializedProto = this.serializeValue(proto);
        let uid = this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(obj);
        let condition = t.binaryExpression("!==", t.memberExpression(uid, protoExpression), serializedProto);
        let throwblock = t.blockStatement([
          t.throwStatement(t.newExpression(t.identifier("Error"), [t.stringLiteral("unexpected prototype")])),
        ]);
        this.emitter.emit(t.ifStatement(condition, throwblock));
      });
      return;
    }
    if (proto === this.realm.intrinsics[kind + "Prototype"]) return;

    this.emitter.emitNowOrAfterWaitingForDependencies([proto, obj], () => {
      invariant(proto);
      let serializedProto = this.serializeValue(proto);
      let uid = this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(obj);
      if (!this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION))
        this.emitter.emit(
          t.expressionStatement(
            t.callExpression(this.preludeGenerator.memoizeReference("Object.setPrototypeOf"), [uid, serializedProto])
          )
        );
      else {
        this.emitter.emit(
          t.expressionStatement(t.assignmentExpression("=", t.memberExpression(uid, protoExpression), serializedProto))
        );
      }
    });
  }

  _emitConstructorPrototype(func: FunctionValue) {
    // If the original prototype object was mutated,
    // request its serialization here as this might be observable by
    // residual code.
    let prototype = ResidualHeapInspector.getPropertyValue(func, "prototype");
    if (prototype instanceof ObjectValue && this.residualValues.has(prototype)) {
      this.emitter.emitNowOrAfterWaitingForDependencies([func], () => {
        invariant(prototype);
        this.serializeValue(prototype);
      });
    }
  }

  _getNestedAbstractValues(absVal: AbstractValue, values: Array<Value>): Array<Value> {
    invariant(absVal.args.length === 3);
    let cond = absVal.args[0];
    invariant(cond instanceof AbstractValue);
    if (cond.kind === "template for property name condition") {
      let P = cond.args[0];
      values.push(P);
      let V = absVal.args[1];
      values.push(V);
      let W = absVal.args[2];
      if (W instanceof AbstractValue) this._getNestedAbstractValues(W, values);
      else values.push(W);
    } else {
      // conditional assignment
      values.push(cond);
      let consequent = absVal.args[1];
      invariant(consequent instanceof AbstractValue);
      let alternate = absVal.args[2];
      invariant(alternate instanceof AbstractValue);
      this._getNestedAbstractValues(consequent, values);
      this._getNestedAbstractValues(alternate, values);
    }
    return values;
  }

  _emitPropertiesWithComputedNames(obj: ObjectValue, absVal: AbstractValue) {
    invariant(absVal.args.length === 3);
    let cond = absVal.args[0];
    invariant(cond instanceof AbstractValue);
    if (cond.kind === "template for property name condition") {
      let P = cond.args[0];
      invariant(P instanceof AbstractValue);
      let V = absVal.args[1];
      let earlier_props = absVal.args[2];
      if (earlier_props instanceof AbstractValue) this._emitPropertiesWithComputedNames(obj, earlier_props);
      let uid = this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(obj);
      let serializedP = this.serializeValue(P);
      let serializedV = this.serializeValue(V);
      this.emitter.emit(
        t.expressionStatement(t.assignmentExpression("=", t.memberExpression(uid, serializedP, true), serializedV))
      );
    } else {
      // conditional assignment
      let serializedCond = this.serializeValue(cond);
      let consequent = absVal.args[1];
      invariant(consequent instanceof AbstractValue);
      let alternate = absVal.args[2];
      invariant(alternate instanceof AbstractValue);
      let oldBody = this.emitter.beginEmitting("consequent", []);
      this._emitPropertiesWithComputedNames(obj, consequent);
      let consequentBody = this.emitter.endEmitting("consequent", oldBody);
      let consequentStatement = t.blockStatement(consequentBody);
      oldBody = this.emitter.beginEmitting("alternate", []);
      this._emitPropertiesWithComputedNames(obj, alternate);
      let alternateBody = this.emitter.endEmitting("alternate", oldBody);
      let alternateStatement = t.blockStatement(alternateBody);
      this.emitter.emit(t.ifStatement(serializedCond, consequentStatement, alternateStatement));
    }
  }

  _emitProperty(val: ObjectValue, key: string, desc: Descriptor): void {
    if (this._canEmbedProperty(val, key, desc)) {
      let descValue = desc.value;
      invariant(descValue instanceof Value);
      let mightHaveBeenDeleted = descValue.mightHaveBeenDeleted();
      let serializeFunc = () => {
        this._assignProperty(
          () => {
            let serializedKey = this.generator.getAsPropertyNameExpression(key);
            return t.memberExpression(
              this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(val),
              serializedKey,
              !t.isIdentifier(serializedKey)
            );
          },
          () => {
            invariant(descValue instanceof Value);
            return this.serializeValue(descValue);
          },
          mightHaveBeenDeleted
        );
      };
      invariant(!this.emitter.getReasonToWaitForDependencies([descValue, val]), "precondition of _emitProperty");
      if (mightHaveBeenDeleted) {
        this.emitter.emitAfterWaiting(true, [], serializeFunc);
      } else {
        serializeFunc();
      }
    } else {
      let descProps = [];

      let boolKeys = ["enumerable", "configurable"];
      let valKeys = [];

      if (!desc.get && !desc.set) {
        boolKeys.push("writable");
        valKeys.push("value");
      } else {
        valKeys.push("set", "get");
      }

      let descriptorsKey = [];
      for (let boolKey of boolKeys) {
        if (boolKey in desc) {
          let b = desc[boolKey];
          invariant(b !== undefined);
          descProps.push(t.objectProperty(t.identifier(boolKey), t.booleanLiteral(b)));
          descriptorsKey.push(`${boolKey}:${b.toString()}`);
        }
      }

      for (let descKey of valKeys) {
        if (descKey in desc) descriptorsKey.push(descKey);
      }

      descriptorsKey = descriptorsKey.join(",");
      let descriptorId = this.descriptors.get(descriptorsKey);
      if (descriptorId === undefined) {
        descriptorId = t.identifier(this.descriptorNameGenerator.generate(descriptorsKey));
        let declar = t.variableDeclaration("var", [t.variableDeclarator(descriptorId, t.objectExpression(descProps))]);
        // The descriptors are used across all scopes, and thus must be declared in the prelude.
        this.prelude.push(declar);
        this.descriptors.set(descriptorsKey, descriptorId);
      }
      invariant(descriptorId !== undefined);

      for (let descKey of valKeys) {
        if (descKey in desc) {
          let descValue = desc[descKey] || this.realm.intrinsics.undefined;
          invariant(descValue instanceof Value);
          invariant(!this.emitter.getReasonToWaitForDependencies([descValue]), "precondition of _emitProperty");
          this.emitter.emit(
            t.expressionStatement(
              t.assignmentExpression(
                "=",
                t.memberExpression(descriptorId, t.identifier(descKey)),
                this.serializeValue(descValue)
              )
            )
          );
        }
      }

      let serializedKey = this.generator.getAsPropertyNameExpression(key, /*canBeIdentifier*/ false);
      invariant(!this.emitter.getReasonToWaitForDependencies([val]), "precondition of _emitProperty");
      let uid = this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(val);
      this.emitter.emit(
        t.expressionStatement(
          t.callExpression(this.preludeGenerator.memoizeReference("Object.defineProperty"), [
            uid,
            serializedKey,
            descriptorId,
          ])
        )
      );
    }
  }

  _serializeDeclarativeEnvironmentRecordBinding(visitedBinding: VisitedBinding): SerializedBinding {
    let serializedBinding = this.declarativeEnvironmentRecordsBindings.get(visitedBinding);
    if (!serializedBinding) {
      let value = visitedBinding.value;
      invariant(value);
      invariant(visitedBinding.declarativeEnvironmentRecord);

      // Set up binding identity before starting to serialize value. This is needed in case of recursive dependencies.
      serializedBinding = {
        serializedValue: undefined,
        value,
        modified: visitedBinding.modified,
        referentialized: false,
        declarativeEnvironmentRecord: visitedBinding.declarativeEnvironmentRecord,
      };
      this.declarativeEnvironmentRecordsBindings.set(visitedBinding, serializedBinding);
      let serializedValue = this.serializeValue(value);
      serializedBinding.serializedValue = serializedValue;
      if (value.mightBeObject()) {
        // Increment ref count one more time to ensure that this object will be assigned a unique id.
        // This ensures that only once instance is created across all possible residual function invocations.
        this.residualHeapValueIdentifiers.incrementReferenceCount(value);
      }
    }
    return serializedBinding;
  }

  // Determine whether initialization code for a value should go into the main body, or a more specific initialization body.
  _getTarget(val: Value, scopes: Set<Scope>): { body: Array<BabelNodeStatement>, usedOnlyByResidualFunctions?: true } {
    // All relevant values were visited in at least one scope.
    invariant(scopes.size >= 1);

    // First, let's figure out from which function and generator scopes this value is referenced.
    let functionValues = [];
    let generators = [];
    for (let scope of scopes) {
      if (scope instanceof FunctionValue) functionValues.push(scope);
      else {
        invariant(scope instanceof Generator);
        if (scope === this.realm.generator) {
          // This value is used from the main generator scope. This means that we need to emit the value and its
          // initialization code into the main body, and cannot delay initialization.
          return { body: this.mainBody };
        }
        generators.push(scope);
      }
    }

    if (generators.length === 0) {
      let body = this.residualFunctions.residualFunctionInitializers.registerValueOnlyReferencedByResidualFunctions(
        functionValues,
        val
      );
      return { body: body, usedOnlyByResidualFunctions: true };
    }

    // TODO: What does this mean? Where should the code go? Figure this out.
    // TODO #482: If there's more than one generator involved, We should walk up the generator chain, and find the first common generator, and then choose a body that will be emitted just before that common generator.
    // For now, stick to historical behavior.
    return { body: this.emitter.getBody() };
  }

  serializeValue(val: Value, referenceOnly?: boolean, bindingType?: BabelVariableKind): BabelNodeExpression {
    let scopes = this.residualValues.get(val);
    invariant(scopes !== undefined);

    let ref = this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCountOptional(val);
    if (ref) {
      return ref;
    }

    this.serializedValues.add(val);
    if (!referenceOnly && ResidualHeapInspector.isLeaf(val)) {
      let res = this._serializeValue(val);
      invariant(res !== undefined);
      return res;
    }

    let target = this._getTarget(val, scopes);

    let name = this.valueNameGenerator.generate(val.__originalName || "");
    let id = t.identifier(name);
    this.residualHeapValueIdentifiers.setIdentifier(val, id);
    let oldBody = this.emitter.beginEmitting(val, target.body);
    let init = this._serializeValue(val);
    let result = id;
    this.residualHeapValueIdentifiers.incrementReferenceCount(val);

    if (this.residualHeapValueIdentifiers.needsIdentifier(val)) {
      if (init) {
        if (init !== id) {
          if (target.usedOnlyByResidualFunctions) {
            let declar = t.variableDeclaration(bindingType ? bindingType : "var", [t.variableDeclarator(id)]);
            this.mainBody.push(declar);
            let assignment = t.expressionStatement(t.assignmentExpression("=", id, init));
            this.emitter.emit(assignment);
          } else {
            let declar = t.variableDeclaration(bindingType ? bindingType : "var", [t.variableDeclarator(id, init)]);
            this.emitter.emit(declar);
          }
        }
        this.statistics.valueIds++;
        if (target.usedOnlyByResidualFunctions) this.statistics.delayedValues++;
      }
    } else {
      if (init) {
        this.residualHeapValueIdentifiers.deleteIdentifier(val);
        result = init;
        this.statistics.valuesInlined++;
      }
    }

    this.emitter.endEmitting(val, oldBody);
    return result;
  }

  _serializeValueIntrinsic(val: Value): BabelNodeExpression {
    invariant(val.intrinsicName);
    return this.preludeGenerator.convertStringToMember(val.intrinsicName);
  }

  _getDescriptorValues(desc: Descriptor): Array<Value> {
    if (desc.value !== undefined) return [desc.value];
    invariant(desc.get !== undefined);
    invariant(desc.set !== undefined);
    return [desc.get, desc.set];
  }

  _assignProperty(
    locationFn: () => BabelNodeLVal,
    valueFn: () => BabelNodeExpression,
    mightHaveBeenDeleted: boolean,
    cleanupDummyProperty: boolean = false
  ) {
    let location = locationFn();
    let value = valueFn();
    let assignment = t.expressionStatement(t.assignmentExpression("=", location, value));
    if (mightHaveBeenDeleted) {
      let condition = t.binaryExpression("!==", value, this.serializeValue(this.realm.intrinsics.empty));
      let deletion = null;
      if (cleanupDummyProperty) {
        invariant(location.type === "MemberExpression");
        deletion = t.expressionStatement(
          t.unaryExpression("delete", ((location: any): BabelNodeMemberExpression), true)
        );
      }
      this.emitter.emit(t.ifStatement(condition, assignment, deletion));
    } else {
      this.emitter.emit(assignment);
    }
  }

  _serializeValueArray(val: ObjectValue): BabelNodeExpression {
    let realm = this.realm;
    let elems = [];

    let remainingProperties = new Map(val.properties);

    // If array length is abstract set it manually and then all known properties (including numeric indices)
    let lenProperty = Get(realm, val, "length");
    if (lenProperty instanceof AbstractValue) {
      this.emitter.emitNowOrAfterWaitingForDependencies([val], () => {
        this._assignProperty(
          () =>
            t.memberExpression(
              this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(val),
              t.identifier("length")
            ),
          () => {
            return this.serializeValue(lenProperty);
          },
          false /*mightHaveBeenDeleted*/
        );
      });
      remainingProperties.delete("length");
    } else {
      // An array's length property cannot be redefined, so this won't run user code
      let len = ToLength(realm, lenProperty);
      for (let i = 0; i < len; i++) {
        let key = i + "";
        let propertyBinding = remainingProperties.get(key);
        let elem = null;
        if (propertyBinding !== undefined) {
          let descriptor = propertyBinding.descriptor;
          if (descriptor !== undefined && descriptor.value !== undefined) {
            // deleted
            remainingProperties.delete(key);
            if (this._canEmbedProperty(val, key, descriptor)) {
              let elemVal = descriptor.value;
              invariant(elemVal instanceof Value);
              let mightHaveBeenDeleted = elemVal.mightHaveBeenDeleted();
              let delayReason = this.emitter.getReasonToWaitForDependencies(elemVal) || mightHaveBeenDeleted;
              if (delayReason) {
                // handle self recursion
                this.emitter.emitAfterWaiting(delayReason, [elemVal, val], () => {
                  this._assignProperty(
                    () =>
                      t.memberExpression(
                        this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(val),
                        t.numericLiteral(i),
                        true
                      ),
                    () => {
                      invariant(elemVal !== undefined);
                      return this.serializeValue(elemVal);
                    },
                    mightHaveBeenDeleted
                  );
                });
              } else {
                elem = this.serializeValue(elemVal);
              }
            }
          }
        }
        elems.push(elem);
      }
    }

    this._emitObjectProperties(val, remainingProperties);
    return t.arrayExpression(elems);
  }

  _serializeValueMap(val: ObjectValue): BabelNodeExpression {
    let kind = val.getKind();
    let elems = [];

    let entries;
    if (kind === "Map") {
      entries = val.$MapData;
    } else {
      invariant(kind === "WeakMap");
      entries = val.$WeakMapData;
    }
    invariant(entries !== undefined);
    let len = entries.length;
    let mapConstructorDoesntTakeArguments = this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION);

    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      let key = entry.$Key;
      let value = entry.$Value;
      if (key === undefined || value === undefined) continue;
      let mightHaveBeenDeleted = key.mightHaveBeenDeleted();
      let delayReason =
        this.emitter.getReasonToWaitForDependencies(key) ||
        this.emitter.getReasonToWaitForDependencies(value) ||
        mightHaveBeenDeleted ||
        mapConstructorDoesntTakeArguments;
      if (delayReason) {
        // handle self recursion
        this.emitter.emitAfterWaiting(delayReason, [key, value, val], () => {
          invariant(key !== undefined);
          invariant(value !== undefined);
          this.emitter.emit(
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(
                  this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(val),
                  t.identifier("set")
                ),
                [this.serializeValue(key), this.serializeValue(value)]
              )
            )
          );
        });
      } else {
        let serializedKey = this.serializeValue(key);
        let serializedValue = this.serializeValue(value);
        let elem = t.arrayExpression([serializedKey, serializedValue]);
        elems.push(elem);
      }
    }

    this._emitObjectProperties(val);
    let args = elems.length > 0 ? [t.arrayExpression(elems)] : [];
    return t.newExpression(this.preludeGenerator.memoizeReference(kind), args);
  }

  _serializeValueSet(val: ObjectValue): BabelNodeExpression {
    let kind = val.getKind();
    let elems = [];

    let entries;
    if (kind === "Set") {
      entries = val.$SetData;
    } else {
      invariant(kind === "WeakSet");
      entries = val.$WeakSetData;
    }
    invariant(entries !== undefined);
    let len = entries.length;
    let setConstructorDoesntTakeArguments = this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION);

    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      if (entry === undefined) continue;
      let mightHaveBeenDeleted = entry.mightHaveBeenDeleted();
      let delayReason =
        this.emitter.getReasonToWaitForDependencies(entry) || mightHaveBeenDeleted || setConstructorDoesntTakeArguments;
      if (delayReason) {
        // handle self recursion
        this.emitter.emitAfterWaiting(delayReason, [entry, val], () => {
          invariant(entry !== undefined);
          this.emitter.emit(
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(
                  this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(val),
                  t.identifier("add")
                ),
                [this.serializeValue(entry)]
              )
            )
          );
        });
      } else {
        let elem = this.serializeValue(entry);
        elems.push(elem);
      }
    }

    this._emitObjectProperties(val);
    let args = elems.length > 0 ? [t.arrayExpression(elems)] : [];
    return t.newExpression(this.preludeGenerator.memoizeReference(kind), args);
  }

  _serializeValueTypedArrayOrDataView(val: ObjectValue): BabelNodeExpression {
    let buf = val.$ViewedArrayBuffer;
    invariant(buf !== undefined);
    let outlinedArrayBuffer = this.serializeValue(buf, true);
    this._emitObjectProperties(val);
    return t.newExpression(this.preludeGenerator.memoizeReference(val.getKind()), [outlinedArrayBuffer]);
  }

  _serializeValueArrayBuffer(val: ObjectValue): BabelNodeExpression {
    let elems = [];

    let len = val.$ArrayBufferByteLength;
    let db = val.$ArrayBufferData;
    invariant(len !== undefined);
    invariant(db);
    let allzero = true;
    for (let i = 0; i < len; i++) {
      if (db[i] !== 0) {
        allzero = false;
      }
      let elem = t.numericLiteral(db[i]);
      elems.push(elem);
    }

    this._emitObjectProperties(val);
    if (allzero) {
      // if they're all zero, just emit the array buffer constructor
      return t.newExpression(this.preludeGenerator.memoizeReference(val.getKind()), [t.numericLiteral(len)]);
    } else {
      // initialize from a byte array otherwise
      let arrayValue = t.arrayExpression(elems);
      let consExpr = t.newExpression(this.preludeGenerator.memoizeReference("Uint8Array"), [arrayValue]);
      // access the Uint8Array.buffer property to extract the created buffer
      return t.memberExpression(consExpr, t.identifier("buffer"));
    }
  }

  _serializeValueFunction(val: FunctionValue): void | BabelNodeExpression {
    if (val instanceof BoundFunctionValue) {
      this._emitObjectProperties(val);
      return t.callExpression(
        t.memberExpression(this.serializeValue(val.$BoundTargetFunction), t.identifier("bind")),
        [].concat(
          this.serializeValue(val.$BoundThis),
          val.$BoundArguments.map((boundArg, i) => this.serializeValue(boundArg))
        )
      );
    }

    if (val instanceof NativeFunctionValue) {
      throw new FatalError("TODO: do not know how to serialize non-intrinsic native function value");
    }

    let residualBindings = this.residualFunctionBindings.get(val);
    invariant(residualBindings);

    let serializedBindings = Object.create(null);
    let instance: FunctionInstance = {
      serializedBindings,
      functionValue: val,
      scopeInstances: new Set(),
    };

    let delayed = 1;
    let undelay = () => {
      if (--delayed === 0) {
        instance.insertionPoint = this.emitter.getBodyReference();
        this.residualFunctions.addFunctionInstance(instance);
      }
    };
    for (let boundName in residualBindings) {
      let residualBinding = residualBindings[boundName];
      let referencedValues = [];
      let serializeBindingFunc;
      if (!residualBinding.declarativeEnvironmentRecord) {
        serializeBindingFunc = () => this._serializeGlobalBinding(boundName, residualBinding);
      } else {
        serializeBindingFunc = () => {
          return this._serializeDeclarativeEnvironmentRecordBinding(residualBinding);
        };
        invariant(residualBinding.value !== undefined);
        referencedValues.push(residualBinding.value);
      }
      delayed++;
      this.emitter.emitNowOrAfterWaitingForDependencies(referencedValues, () => {
        let serializedBinding = serializeBindingFunc();
        invariant(serializedBinding);
        serializedBindings[boundName] = serializedBinding;
        undelay();
      });
    }

    undelay();

    this._emitObjectProperties(val);
  }

  // Checks whether a property can be defined via simple assignment, or using object literal syntax.
  _canEmbedProperty(obj: ObjectValue, key: string, prop: Descriptor): boolean {
    if ((obj instanceof FunctionValue && key === "prototype") || (obj.getKind() === "RegExp" && key === "lastIndex"))
      return !!prop.writable && !prop.configurable && !prop.enumerable && !prop.set && !prop.get;
    else return !!prop.writable && !!prop.configurable && !!prop.enumerable && !prop.set && !prop.get;
  }

  _findLastObjectPrototype(obj: ObjectValue): ObjectValue {
    while (obj.$Prototype instanceof ObjectValue) obj = obj.$Prototype;
    return obj;
  }

  _serializeValueObject(val: ObjectValue): BabelNodeExpression {
    // If this object is a prototype object that was implicitly created by the runtime
    // for a constructor, then we can obtain a reference to this object
    // in a special way that's handled alongside function serialization.
    let constructor = val.originalConstructor;
    if (constructor !== undefined) {
      let prototypeId = this.residualHeapValueIdentifiers.getIdentifier(val);
      this.emitter.emitNowOrAfterWaitingForDependencies([constructor], () => {
        invariant(constructor !== undefined);
        invariant(prototypeId !== undefined);
        this.serializeValue(constructor);
        this._emitObjectProperties(val);
        invariant(prototypeId.type === "Identifier");
        this.residualFunctions.setFunctionPrototype(constructor, prototypeId);
      });
      return prototypeId;
    }

    let kind = val.getKind();
    switch (kind) {
      case "RegExp":
        let source = val.$OriginalSource;
        let flags = val.$OriginalFlags;
        invariant(typeof source === "string");
        invariant(typeof flags === "string");
        this._emitObjectProperties(val);
        source = new RegExp(source).source; // add escapes as per 21.2.3.2.4
        return t.regExpLiteral(source, flags);
      case "Number":
        let numberData = val.$NumberData;
        invariant(numberData !== undefined);
        this._emitObjectProperties(val);
        return t.newExpression(this.preludeGenerator.memoizeReference("Number"), [t.numericLiteral(numberData.value)]);
      case "String":
        let stringData = val.$StringData;
        invariant(stringData !== undefined);
        this._emitObjectProperties(val);
        return t.newExpression(this.preludeGenerator.memoizeReference("String"), [t.stringLiteral(stringData.value)]);
      case "Boolean":
        let booleanData = val.$BooleanData;
        invariant(booleanData !== undefined);
        this._emitObjectProperties(val);
        return t.newExpression(this.preludeGenerator.memoizeReference("Boolean"), [
          t.booleanLiteral(booleanData.value),
        ]);
      case "Date":
        let dateValue = val.$DateValue;
        invariant(dateValue !== undefined);
        let serializedDateValue = this.serializeValue(dateValue);
        this._emitObjectProperties(val);
        return t.newExpression(this.preludeGenerator.memoizeReference("Date"), [serializedDateValue]);
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
        return this._serializeValueTypedArrayOrDataView(val);
      case "ArrayBuffer":
        return this._serializeValueArrayBuffer(val);
      case "Map":
      case "WeakMap":
        return this._serializeValueMap(val);
      case "Set":
      case "WeakSet":
        return this._serializeValueSet(val);
      default:
        invariant(kind === "Object", "invariant established by visitor");
        invariant(this.$ParameterMap === undefined, "invariant established by visitor");

        let proto = val.$Prototype;
        let createViaAuxiliaryConstructor =
          proto !== this.realm.intrinsics.ObjectPrototype &&
          this._findLastObjectPrototype(val) === this.realm.intrinsics.ObjectPrototype &&
          proto instanceof ObjectValue;

        let remainingProperties = new Map(val.properties);
        let props = [];
        for (let [key, propertyBinding] of val.properties) {
          let descriptor = propertyBinding.descriptor;
          if (descriptor === undefined || descriptor.value === undefined) continue; // deleted
          if (!createViaAuxiliaryConstructor && this._canEmbedProperty(val, key, descriptor)) {
            remainingProperties.delete(key);
            let propValue = descriptor.value;
            invariant(propValue instanceof Value);
            if (this.residualHeapInspector.canIgnoreProperty(val, key)) continue;
            let mightHaveBeenDeleted = propValue.mightHaveBeenDeleted();
            let delayReason = this.emitter.getReasonToWaitForDependencies(propValue) || mightHaveBeenDeleted;
            if (delayReason) {
              // self recursion
              this.emitter.emitAfterWaiting(delayReason, [propValue, val], () => {
                this._assignProperty(
                  () => {
                    let serializedKey = this.generator.getAsPropertyNameExpression(key);
                    return t.memberExpression(
                      this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(val),
                      serializedKey,
                      !t.isIdentifier(serializedKey)
                    );
                  },
                  () => {
                    invariant(propValue instanceof Value);
                    return this.serializeValue(propValue);
                  },
                  mightHaveBeenDeleted,
                  true /*cleanupDummyProperty*/
                );
              });

              // Although the property needs to be delayed, we still want to emit dummy "undefined"
              // value as part of the object literal to ensure a consistent property ordering.
              let serializedKey = this.generator.getAsPropertyNameExpression(key);
              props.push(t.objectProperty(serializedKey, voidExpression));
            } else {
              let serializedKey = this.generator.getAsPropertyNameExpression(key);
              props.push(t.objectProperty(serializedKey, this.serializeValue(propValue)));
            }
          }
        }

        this._emitObjectProperties(val, remainingProperties, createViaAuxiliaryConstructor);

        if (createViaAuxiliaryConstructor) {
          this.needsAuxiliaryConstructor = true;
          let serializedProto = this.serializeValue(proto);
          return t.sequenceExpression([
            t.assignmentExpression(
              "=",
              t.memberExpression(constructorExpression, t.identifier("prototype")),
              serializedProto
            ),
            t.newExpression(constructorExpression, []),
          ]);
        } else {
          return t.objectExpression(props);
        }
    }
  }

  _serializeValueSymbol(val: SymbolValue): BabelNodeExpression {
    let args = [];
    if (val.$Description) args.push(t.stringLiteral(val.$Description));
    return t.callExpression(this.preludeGenerator.memoizeReference("Symbol"), args);
  }

  _serializeValueProxy(val: ProxyValue): BabelNodeExpression {
    return t.newExpression(this.preludeGenerator.memoizeReference("Proxy"), [
      this.serializeValue(val.$ProxyTarget),
      this.serializeValue(val.$ProxyHandler),
    ]);
  }

  _serializeAbstractValue(val: AbstractValue): BabelNodeExpression {
    invariant(val.kind !== "sentinel member expression", "invariant established by visitor");
    let serializedArgs = val.args.map((abstractArg, i) => this.serializeValue(abstractArg));
    let serializedValue = val.buildNode(serializedArgs);
    if (serializedValue.type === "Identifier") {
      let id = ((serializedValue: any): BabelNodeIdentifier);
      invariant(!this.preludeGenerator.derivedIds.has(id.name) || this.emitter.hasDeclaredDerivedIdBeenAnnounced(id));
    }
    return serializedValue;
  }

  _serializeValue(val: Value): void | BabelNodeExpression {
    if (val instanceof AbstractValue) {
      return this._serializeAbstractValue(val);
    } else if (val.isIntrinsic()) {
      return this._serializeValueIntrinsic(val);
    } else if (val instanceof EmptyValue) {
      this.needsEmptyVar = true;
      return emptyExpression;
    } else if (val instanceof UndefinedValue) {
      return voidExpression;
    } else if (ResidualHeapInspector.isLeaf(val)) {
      return t.valueToNode(val.serialize());
    } else if (IsArray(this.realm, val)) {
      invariant(val instanceof ObjectValue);
      return this._serializeValueArray(val);
    } else if (val instanceof ProxyValue) {
      return this._serializeValueProxy(val);
    } else if (val instanceof FunctionValue) {
      return this._serializeValueFunction(val);
    } else if (val instanceof SymbolValue) {
      return this._serializeValueSymbol(val);
    } else if (val instanceof ObjectValue) {
      return this._serializeValueObject(val);
    } else {
      invariant(false);
    }
  }

  _serializeGlobalBinding(boundName: string, visitedBinding: VisitedBinding): SerializedBinding {
    invariant(!visitedBinding.declarativeEnvironmentRecord);
    if (boundName === "undefined") {
      // The global 'undefined' property is not writable and not configurable, and thus we can just use 'undefined' here,
      // encoded as 'void 0' to avoid the possibility of interference with local variables named 'undefined'.
      return { serializedValue: voidExpression, value: undefined, modified: true, referentialized: true };
    }

    let value = this.realm.getGlobalLetBinding(boundName);
    // Check for let binding vs global property
    if (value) {
      let id = this.serializeValue(value, true, "let");
      // increment ref count one more time as the value has been
      // referentialized (stored in a variable) by serializeValue
      this.residualHeapValueIdentifiers.incrementReferenceCount(value);
      return { serializedValue: id, value: undefined, modified: true, referentialized: true };
    } else {
      return {
        serializedValue: this.preludeGenerator.globalReference(boundName),
        value: undefined,
        modified: true,
        referentialized: true,
      };
    }
  }

  _getContext(): SerializationContext {
    // TODO #482: Values serialized by nested generators would currently only get defined
    // along the code of the nested generator; their definitions need to get hoisted
    // or repeated so that they are accessible and defined from all using scopes
    let context = {
      serializeValue: this.serializeValue.bind(this),
      serializeGenerator: (generator: Generator) => {
        let oldBody = this.emitter.beginEmitting(generator, []);
        generator.serialize(context);
        return this.emitter.endEmitting(generator, oldBody);
      },
      emit: (statement: BabelNodeStatement) => {
        this.emitter.emit(statement);
      },
      announceDeclaredDerivedId: (id: BabelNodeIdentifier) => {
        this.emitter.announceDeclaredDerivedId(id);
      },
    };
    return context;
  }

  _emitGenerator(generator: Generator) {
    generator.serialize(this._getContext());
    this.emitter.assertIsDrained();
  }

  _shouldBeWrapped(body: Array<any>) {
    for (let i = 0; i < body.length; i++) {
      let item = body[i];
      if (item.type === "ExpressionStatement") {
        continue;
      } else if (item.type === "VariableDeclaration" || item.type === "FunctionDeclaration") {
        return true;
      } else if (item.type === "BlockStatement") {
        if (this._shouldBeWrapped(item.body)) {
          return true;
        }
      } else if (item.type === "IfStatement") {
        if (item.alternate) {
          if (this._shouldBeWrapped(item.alternate.body)) {
            return true;
          }
        }
        if (item.consequent) {
          if (this._shouldBeWrapped(item.consequent.body)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  serialize(): BabelNodeFile {
    this._emitGenerator(this.generator);
    invariant(this.emitter._declaredDerivedIds.size <= this.preludeGenerator.derivedIds.size);

    Array.prototype.push.apply(this.prelude, this.preludeGenerator.prelude);

    // TODO #20: add timers

    // TODO #21: add event listeners
    for (let [moduleId, moduleValue] of this.modules.initializedModules)
      this.requireReturns.set(moduleId, this.serializeValue(moduleValue));

    let {
      hoistedBody,
      unstrictFunctionBodies,
      strictFunctionBodies,
      requireStatistics,
    } = this.residualFunctions.spliceFunctions();
    if (requireStatistics.replaced > 0 && !this.residualHeapValueIdentifiers.collectValToRefCountOnly) {
      console.log(
        `=== ${this.modules.initializedModules.size} of ${this.modules.moduleIds
          .size} modules initialized, ${requireStatistics.replaced} of ${requireStatistics.count} require calls inlined.`
      );
    }

    // add strict modes
    let strictDirective = t.directive(t.directiveLiteral("use strict"));
    let globalDirectives = [];
    if (!unstrictFunctionBodies.length && strictFunctionBodies.length) {
      // no unstrict functions, only strict ones
      globalDirectives.push(strictDirective);
    } else if (unstrictFunctionBodies.length && strictFunctionBodies.length) {
      // strict and unstrict functions
      funcLoop: for (let func of strictFunctionBodies) {
        if (func.body.directives) {
          for (let directive of func.body.directives) {
            if (directive.value.value === "use strict") {
              // already have a use strict directive
              continue funcLoop;
            }
          }
        } else func.body.directives = [];

        func.body.directives.unshift(strictDirective);
      }
    }

    // build ast
    let body = [];
    if (this.needsEmptyVar) {
      body.push(t.variableDeclaration("var", [t.variableDeclarator(emptyExpression, t.objectExpression([]))]));
    }
    if (this.needsAuxiliaryConstructor) {
      body.push(t.functionDeclaration(constructorExpression, [], t.blockStatement([])));
    }
    body = body.concat(this.prelude, hoistedBody, this.emitter.getBody());
    factorifyObjects(body, this.factoryNameGenerator);

    let ast_body = [];
    if (this.preludeGenerator.declaredGlobals.size > 0)
      ast_body.push(
        t.variableDeclaration(
          "var",
          Array.from(this.preludeGenerator.declaredGlobals).map(key => t.variableDeclarator(t.identifier(key)))
        )
      );
    if (body.length) {
      if (this.realm.isCompatibleWith("node-source-maps")) {
        ast_body.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(
                t.callExpression(t.identifier("require"), [t.stringLiteral("source-map-support")]),
                t.identifier("install")
              ),
              []
            )
          )
        );
      }

      if (this._shouldBeWrapped(body)) {
        let globalExpression = this.realm.isCompatibleWith("node-cli") ? t.identifier("global") : t.thisExpression();

        let functionExpression = t.functionExpression(null, [], t.blockStatement(body, globalDirectives));
        let callExpression = this.preludeGenerator.usesThis
          ? t.callExpression(t.memberExpression(functionExpression, t.identifier("call")), [globalExpression])
          : t.callExpression(functionExpression, []);
        ast_body.push(t.expressionStatement(callExpression));
      } else {
        ast_body = body;
      }
    }

    invariant(this.serializedValues.size === this.residualValues.size);
    return t.file(t.program(ast_body));
  }
}
