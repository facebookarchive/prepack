/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { DeclarativeEnvironmentRecord } from "../environment.js";
import { Realm, ExecutionContext } from "../realm.js";
import type { Descriptor, PropertyBinding } from "../types.js";
import { ToLength, IsArray, Get } from "../methods/index.js";
import { Completion } from "../completions.js";
import { BoundFunctionValue, ProxyValue, SymbolValue, AbstractValue, EmptyValue, FunctionValue, Value, ObjectValue, NativeFunctionValue, UndefinedValue } from "../values/index.js";
import * as t from "babel-types";
import type { BabelNodeExpression, BabelNodeStatement, BabelNodeIdentifier, BabelNodeBlockStatement, BabelNodeObjectExpression, BabelNodeStringLiteral, BabelNodeLVal, BabelNodeSpreadElement, BabelVariableKind, BabelNodeFunctionDeclaration, BabelNodeIfStatement } from "babel-types";
import { Generator, PreludeGenerator, NameGenerator } from "../utils/generator.js";
import type { SerializationContext } from "../utils/generator.js";
import generate from "babel-generator";
// import { transform } from "babel-core";
import traverse from "babel-traverse";
import invariant from "../invariant.js";
import type { SerializedBinding, ScopeBinding, VisitedBinding, FunctionInfo, FunctionInstance, SerializerOptions, Names } from "./types.js";
import { BodyReference, AreSameSerializedBindings, SerializerStatistics, type VisitedBindings } from "./types.js";
import { ClosureRefReplacer, IdentifierCollector } from "./visitors.js";
import { Logger } from "./logger.js";
import { Modules } from "./modules.js";
import { LoggingTracer } from "./LoggingTracer.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";

const GLOBAL_CAPTURED_SCOPE_NAME = "__captured_scopes";

type AbstractSyntaxTree = {
  type: string,
  program: {
    type: string,
    body: Array<BabelNodeStatement>
  }
};

function isSameNode(left, right) {
  let type = left.type;

  if (type !== right.type) {
    return false;
  }

  if (type === "Identifier") {
    return left.name === right.name;
  }

  if (type === "NullLiteral") {
    return true;
  }

  if (type === "BooleanLiteral" || type === "StringLiteral" || type === "NumericLiteral") {
    return left.value === right.value;
  }

  return false;
}

export class Serializer {
  static voidExpression = t.unaryExpression("void", t.numericLiteral(0), true);
  static emptyExpression = t.identifier("__empty");
  static constructorExpression = t.identifier("__constructor");
  static protoExpression = t.identifier("__proto__");

  constructor(realm: Realm, serializerOptions: SerializerOptions = {}) {
    invariant(realm.useAbstractInterpretation);
    // Start tracking mutations
    realm.generator = new Generator(realm);

    this.realm = realm;
    this.logger = new Logger(this.realm, !!serializerOptions.internalDebug);
    this.modules = new Modules(this.realm, this.logger, !!serializerOptions.logModules, !!serializerOptions.delayUnsupportedRequires);
    if (serializerOptions.trace) this.realm.tracers.push(new LoggingTracer(this.realm));

    let realmGenerator = this.realm.generator;
    invariant(realmGenerator);
    this.generator = realmGenerator;
    let realmPreludeGenerator = this.realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;

    this.options = serializerOptions;
    this._resetSerializeStates();
  }

  _resetSerializeStates() {
    this.declarativeEnvironmentRecordsBindings = new Map();
    this.serializationStack = [];
    this.delayedSerializations = [];
    this.delayedKeyedSerializations = new Map();
    this.globalReasons = {};
    this.prelude = [];
    this.body = [];

    this.serializedScopes = new Map();
    this.capturedScopeInstanceIdx = 0;

    this.unstrictFunctionBodies = [];
    this.strictFunctionBodies = [];

    this.functions = new Map();
    this.functionInstances = [];
    this.refs = new Map();
    this.declaredDerivedIds = new Set();
    this.descriptors = new Map();
    this.needsEmptyVar = false;
    this.needsAuxiliaryConstructor = false;
    this.valueNameGenerator = this.preludeGenerator.createNameGenerator("_");
    this.descriptorNameGenerator = this.preludeGenerator.createNameGenerator("$$");
    this.factoryNameGenerator = this.preludeGenerator.createNameGenerator("$_");
    this.scopeNameGenerator = this.preludeGenerator.createNameGenerator("__scope_");
    this.requireReturns = new Map();
    this.statistics = new SerializerStatistics();
    this.firstFunctionUsages = new Map();
    this.functionPrototypes = new Map();
    this.serializedValues = new Set();
  }

  globalReasons: {
    [filename: string]: Array<string>
  };

  declarativeEnvironmentRecordsBindings: Map<VisitedBinding, SerializedBinding>;
  serializationStack: Array<Value>;
  delayedSerializations: Array<() => void>;
  delayedKeyedSerializations: Map<BabelNodeIdentifier, Array<{values: Array<Value>, func: () => void}>>;
  unstrictFunctionBodies: Array<BabelNodeFunctionDeclaration>;
  strictFunctionBodies: Array<BabelNodeFunctionDeclaration>;
  functions: Map<BabelNodeBlockStatement, Array<FunctionInstance>>;
  functionInstances: Array<FunctionInstance>;
  //value to intermediate references generated like $0, $1, $2,...
  refs: Map<Value, BabelNodeIdentifier>;
  collectValToRefCountOnly: boolean;
  valToRefCount: Map<Value, number>;
  prelude: Array<BabelNodeStatement>;
  body: Array<BabelNodeStatement>;
  realm: Realm;
  declaredDerivedIds: Set<BabelNodeIdentifier>;
  preludeGenerator: PreludeGenerator;
  generator: Generator;
  descriptors: Map<string, BabelNodeIdentifier>;
  needsEmptyVar: boolean;
  needsAuxiliaryConstructor: boolean;
  valueNameGenerator: NameGenerator;
  descriptorNameGenerator: NameGenerator;
  factoryNameGenerator: NameGenerator;
  scopeNameGenerator: NameGenerator;
  logger: Logger;
  modules: Modules;
  requireReturns: Map<number | string, BabelNodeExpression>;
  options: SerializerOptions;
  statistics: SerializerStatistics;
  firstFunctionUsages: Map<FunctionValue, BodyReference>;
  functionPrototypes: Map<FunctionValue, BabelNodeIdentifier>;
  ignoredProperties: Map<ObjectValue, Set<string>>;
  residualValues: Set<Value>;
  residualFunctionBindings: Map<FunctionValue, VisitedBindings>;
  residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  serializedValues: Set<Value>;
  serializedScopes: Map<DeclarativeEnvironmentRecord, ScopeBinding>;
  capturedScopeInstanceIdx: number;


  _getBodyReference() {
    return new BodyReference(this.body, this.body.length);
  }

  execute(filename: string, code: string, map: string,
      onError: void | ((Realm, Value) => void)) {
    let profile = this.options.profile ? true : false;
    let realm = this.realm;
    let res = realm.$GlobalEnv.execute(code, filename, map, "script", ast =>
      traverse(ast, IdentifierCollector, null, this.preludeGenerator.nameGenerator.forbiddenNames), profile);

    if (res instanceof Completion) {
      let context = new ExecutionContext();
      realm.pushContext(context);
      try {
        if (onError) {
          onError(realm, res.value);
        }
        this.logger.logCompletion(res);
      } finally {
        realm.popContext(context);
      }
    }

    return res;
  }

  addProperties(name: string, obj: ObjectValue, reasons: Array<string>, alternateProperties: ?Map<string, PropertyBinding>, objectPrototypeAlreadyEstablished: boolean = false) {
    /*
    for (let symbol of obj.symbols.keys()) {
      // TODO #22: serialize symbols
    }
    */

    // inject properties
    let ignoredProperties = this.ignoredProperties.get(obj);
    for (let [key, propertyBinding] of alternateProperties || obj.properties) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      if (ignoredProperties && ignoredProperties.has(key)) continue;
      invariant(desc !== undefined);
      this._eagerOrDelay(this._getDescriptorValues(desc).concat(obj), () => {
        invariant(desc !== undefined);
        return this._emitProperty(name, obj, key, desc, reasons);
      });
    }

    // inject properties with computed names
    if (obj.unknownProperty !== undefined) {
      let desc = obj.unknownProperty.descriptor;
      if (desc !== undefined) {
        let val = desc.value;
        invariant(val instanceof AbstractValue);
        this._eagerOrDelay(this._getNestedAbstractValues(val, [obj]), () => {
          invariant(val instanceof AbstractValue);
          this._emitPropertiesWithComputedNames(obj, val, reasons);
        });
      }
    }

    // prototype
    this.addObjectPrototype(name, obj, reasons, objectPrototypeAlreadyEstablished);
    if (obj instanceof FunctionValue) this.addConstructorPrototype(name, obj, reasons);

    this.statistics.objects++;
    this.statistics.objectProperties += obj.properties.size;
  }

  addObjectPrototype(name: string, obj: ObjectValue, reasons: Array<string>, objectPrototypeAlreadyEstablished: boolean) {
    let kind = obj.getKind();
    let proto = obj.$Prototype;
    if (objectPrototypeAlreadyEstablished) {
      // Emitting an assertion. This can be removed in the future, or put under a DEBUG flag.
      this._eagerOrDelay([proto, obj], () => {
        invariant(proto);
        let serializedProto = this.serializeValue(proto, reasons.concat(`Referred to as the prototype for ${name}`));
        let uid = this._getValIdForReference(obj);
        let condition = t.binaryExpression("!==", t.memberExpression(uid, Serializer.protoExpression), serializedProto);
        let throwblock = t.blockStatement([
          t.throwStatement(
            t.newExpression(
              t.identifier("Error"),
              [t.stringLiteral("unexpected prototype")]))
          ]);
        this.body.push(t.ifStatement(condition, throwblock));
      });
      return;
    }
    if (proto === this.realm.intrinsics[kind + "Prototype"]) return;

    this._eagerOrDelay([proto, obj], () => {
      invariant(proto);
      let serializedProto = this.serializeValue(proto, reasons.concat(`Referred to as the prototype for ${name}`));
      let uid = this._getValIdForReference(obj);
      if (!this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION))
        this.body.push(t.expressionStatement(t.callExpression(
          this.preludeGenerator.memoizeReference("Object.setPrototypeOf"),
          [uid, serializedProto]
        )));
      else {
        this.body.push(t.expressionStatement(t.assignmentExpression(
          "=",
          t.memberExpression(uid, Serializer.protoExpression),
          serializedProto
        )));
      }
    });
  }

  addConstructorPrototype(name: string, func: FunctionValue, reasons: Array<string>) {
    // If the original prototype object was mutated,
    // request its serialization here as this might be observable by
    // residual code.
    let prototype = ResidualHeapVisitor.getPropertyValue(func, "prototype");
    if (prototype instanceof ObjectValue && this.residualValues.has(prototype)) {
      this._eagerOrDelay([func], () => {
        invariant(prototype);
        this.serializeValue(prototype, reasons.concat(`Prototype of ${name}`));
      });
    }
  }

  _getNestedAbstractValues(absVal: AbstractValue, values: Array<Value>): Array<Value> {
    invariant(absVal.args.length === 3);
    let cond = absVal.args[0];
    invariant(cond instanceof AbstractValue);
    if (cond.kind === "template for property name condition") {
      let P = cond.args[0]; values.push(P);
      let V = absVal.args[1]; values.push(V);
      let W = absVal.args[2];
      if (W instanceof AbstractValue)
        this._getNestedAbstractValues(W, values);
      else
        values.push(W);
    } else {
      // conditional assignment
      values.push(cond);
      let consequent = absVal.args[1]; invariant(consequent instanceof AbstractValue);
      let alternate = absVal.args[2]; invariant(alternate instanceof AbstractValue);
      this._getNestedAbstractValues(consequent, values);
      this._getNestedAbstractValues(alternate, values);
    }
    return values;
  }

  _emitPropertiesWithComputedNames(obj: ObjectValue, absVal: AbstractValue, reasons: Array<string>) {
    invariant(absVal.args.length === 3);
    let cond = absVal.args[0];
    invariant(cond instanceof AbstractValue);
    if (cond.kind === "template for property name condition") {
      let P = cond.args[0]; invariant(P instanceof AbstractValue);
      let V = absVal.args[1];
      let earlier_props = absVal.args[2];
      if (earlier_props instanceof AbstractValue)
        this._emitPropertiesWithComputedNames(obj, earlier_props, reasons);
      let uid = this._getValIdForReference(obj);
      let serializedP = this.serializeValue(P, reasons.concat("Computed property name"));
      let serializedV = this.serializeValue(V, reasons.concat("Computed property value"));
      this.body.push(t.expressionStatement(t.assignmentExpression(
        "=",
        t.memberExpression(uid, serializedP, true),
        serializedV
      )));
    } else {
      // conditional assignment
      let serializedCond = this.serializeValue(cond, reasons.concat("joined computed property condition"));
      let consequent = absVal.args[1]; invariant(consequent instanceof AbstractValue);
      let alternate = absVal.args[2]; invariant(alternate instanceof AbstractValue);
      let saved_body = this.body;
      this.body = [];
      this._emitPropertiesWithComputedNames(obj, consequent, reasons);
      let consequent_body = t.blockStatement(this.body);
      this.body = [];
      this._emitPropertiesWithComputedNames(obj, alternate, reasons);
      let alternate_body = t.blockStatement(this.body);
      this.body = saved_body;
      this.body.push(t.ifStatement(serializedCond, consequent_body, alternate_body));
    }
  }

  _emitProperty(name: string, val: ObjectValue, key: string, desc: Descriptor, reasons: Array<string>): void {
    if (this._canEmbedProperty(val, key, desc)) {
      let descValue = desc.value;
      invariant(descValue instanceof Value);
      let mightHaveBeenDeleted = descValue.mightHaveBeenDeleted();
      let serializeFunc = () => {
        this._assignProperty(
          () => {
            let serializedKey = this.generator.getAsPropertyNameExpression(key);
            return t.memberExpression(this._getValIdForReference(val), serializedKey, !t.isIdentifier(serializedKey));
          },
          () => {
            invariant(descValue instanceof Value);
            return this.serializeValue(
              descValue,
              reasons.concat(`Referred to in the object ${name} for the key ${key}`));
          },
          mightHaveBeenDeleted);
      };
      invariant(!this._shouldDelayValues([descValue, val]), "precondition of _emitProperty");
      if (mightHaveBeenDeleted) {
        this._delay(true, [], serializeFunc);
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
        let declar = t.variableDeclaration("var", [
          t.variableDeclarator(descriptorId, t.objectExpression(descProps))]);
        this.body.push(declar);
        this.descriptors.set(descriptorsKey, descriptorId);
      }
      invariant(descriptorId !== undefined);

      for (let descKey of valKeys) {
        if (descKey in desc) {
          let descValue = desc[descKey] || this.realm.intrinsics.undefined;
          invariant(descValue instanceof Value);
          invariant(!this._shouldDelayValues([descValue]), "precondition of _emitProperty");
          this.body.push(t.expressionStatement(t.assignmentExpression(
            "=",
            t.memberExpression(descriptorId, t.identifier(descKey)),
            this.serializeValue(
              descValue,
              reasons.concat(`Referred to in the object ${name} for the key ${((key: any): BabelNodeIdentifier).name || ((key: any): BabelNodeStringLiteral).value} in the descriptor property ${descKey}`)
            )
          )));
        }
      }

      let serializedKey = this.generator.getAsPropertyNameExpression(key, /*canBeIdentifier*/false);
      invariant(!this._shouldDelayValues([val]), "precondition of _emitProperty");
      let uid = this._getValIdForReference(val);
      this.body.push(t.expressionStatement(t.callExpression(
        this.preludeGenerator.memoizeReference("Object.defineProperty"),
        [uid, serializedKey, descriptorId]
      )));
    }
  }

  _serializeDeclarativeEnvironmentRecordBinding(boundName: string, visitedBinding: VisitedBinding, functionName: string, reasons: Array<string>): SerializedBinding {
    let serializedBinding = this.declarativeEnvironmentRecordsBindings.get(visitedBinding);
    if (!serializedBinding) {
      let value = visitedBinding.value;
      invariant(value);
      invariant(visitedBinding.declarativeEnvironmentRecord);

      // Set up binding identity before starting to serialize value. This is needed in case of recursive dependencies.
      serializedBinding = { serializedValue: undefined, value, modified: visitedBinding.modified, referentialized: false, declarativeEnvironmentRecord: visitedBinding.declarativeEnvironmentRecord };
      this.declarativeEnvironmentRecordsBindings.set(visitedBinding, serializedBinding);
      let serializedValue = this.serializeValue(
        value,
        reasons.concat(`access in ${functionName} to ${boundName}`));
      serializedBinding.serializedValue = serializedValue;
      if (value.mightBeObject()) {
        // Increment ref count one more time to ensure that this object will be assigned a unique id.
        // This ensures that only once instance is created across all possible residual function invocations.
        this._incrementValToRefCount(value);
      }
    }
    return serializedBinding;
  }

  _getValIdForReference(val: Value): BabelNodeIdentifier {
    let id = this._getValIdForReferenceOptional(val);
    invariant(id, "Value Id cannot be null or undefined");
    return id;
  }

  _getValIdForReferenceOptional(val: Value): ?BabelNodeIdentifier {
    let id = this.refs.get(val);
    if (id) {
      this._incrementValToRefCount(val);
    }
    return id;
  }

  _incrementValToRefCount(val: Value) {
    if (this.collectValToRefCountOnly) {
      let refCount = this.valToRefCount.get(val);
      if (refCount) {
        refCount++;
      } else {
        refCount = 1;
      }
      this.valToRefCount.set(val, refCount);
    }
  }

  serializeValue(val: Value, reasons?: Array<string>, referenceOnly?: boolean, bindingType?: BabelVariableKind): BabelNodeExpression {
    invariant(this.residualValues.has(val));

    let ref = this._getValIdForReferenceOptional(val);
    if (ref) {
      return ref;
    }

    this.serializedValues.add(val);
    reasons = reasons || [];
    if (!referenceOnly && ResidualHeapVisitor.isLeaf(val)) {
      let res = this._serializeValue("", val, reasons);
      invariant(res !== undefined);
      return res;
    }

    let name = this.valueNameGenerator.generate(val.__originalName || "");
    let id = t.identifier(name);
    this.refs.set(val, id);
    this.serializationStack.push(val);
    let init = this._serializeValue(name, val, reasons);
    let result = id;
    this._incrementValToRefCount(val);

    if (reasons.length) {
      this.globalReasons[name] = reasons;
    }

    // default to 2 because we don't want the serializer to assume there's
    // one reference and inline the value
    let refCount = this.options.singlePass ? 2 : this.valToRefCount.get(val);
    invariant(refCount !== undefined && refCount > 0);
    if (this.collectValToRefCountOnly ||
      refCount !== 1) {
       if (init) {
         if (init !== id) {
           let declar = t.variableDeclaration((bindingType ? bindingType : "var"), [
             t.variableDeclarator(id, init)
           ]);

           this.body.push(declar);
         }
         this.statistics.valueIds++;
       }
     } else {
       if (init) {
         this.refs.delete(val);
         result = init;
         this.statistics.valueIdsElided++;
       }
     }

    this.serializationStack.pop();
    if (this.serializationStack.length === 0) {
      while (this.delayedSerializations.length) {
        invariant(this.serializationStack.length === 0);
        let serializer = this.delayedSerializations.shift();
        serializer();
      }
    }

    return result;
  }

  _serializeValueIntrinsic(val: Value): BabelNodeExpression {
    invariant(val.intrinsicName);
    return this.preludeGenerator.convertStringToMember(val.intrinsicName);
  }

  _delay(reason: boolean | BabelNodeIdentifier, values: Array<Value>, func: () => void) {
    invariant(reason);
    if (reason === true) {
      this.delayedSerializations.push(func);
    } else {
      let a = this.delayedKeyedSerializations.get(reason);
      if (a === undefined) this.delayedKeyedSerializations.set(reason, a = []);
      a.push({ values, func });
    }
  }

  _getDescriptorValues(desc: Descriptor): Array<Value> {
    if (desc.value !== undefined) return [desc.value];
    invariant(desc.get !== undefined);
    invariant(desc.set !== undefined);
    return [desc.get, desc.set];
  }

  _shouldDelayValues(values: Array<Value>): boolean | BabelNodeIdentifier {
    for (let value of values) {
      let delayReason = this._shouldDelayValue(value);
      if (delayReason) return delayReason;
    }
    return false;
  }

  _shouldDelayValue(val: Value): boolean | BabelNodeIdentifier {
    // Serialization of a statement related to a value MUST be delayed if
    // the creation of the value's identity requires the availability of either:
    // 1. a time-dependent value that is declared by some generator entry
    //    that has not yet been processed
    //    (tracked by the `declaredDerivedIds` set), or
    // 2. a value that is also currently being serialized
    //    (tracked by the `serializationStack`).
    let delayReason;
    if (val instanceof BoundFunctionValue) {
      delayReason = this._shouldDelayValue(val.$BoundTargetFunction);
      if (delayReason) return delayReason;
      delayReason = this._shouldDelayValue(val.$BoundThis);
      if (delayReason) return delayReason;
      for (let arg of val.$BoundArguments) {
        delayReason = this._shouldDelayValue(arg);
        if (delayReason) return delayReason;
      }
    } else if (val instanceof FunctionValue) {
      if (!this.firstFunctionUsages.has(val)) this.firstFunctionUsages.set(val, this._getBodyReference());
      return false;
    } else if (val instanceof AbstractValue) {
      if (val.hasIdentifier() && !this.declaredDerivedIds.has(val.getIdentifier())) return val.getIdentifier();
      for (let arg of val.args) {
        delayReason = this._shouldDelayValue(arg);
        if (delayReason) return delayReason;
      }
    } else if (val instanceof ProxyValue) {
      delayReason = this._shouldDelayValue(val.$ProxyTarget);
      if (delayReason) return delayReason;
      delayReason = this._shouldDelayValue(val.$ProxyHandler);
      if (delayReason) return delayReason;
    } else if (val instanceof ObjectValue) {
      let kind = val.getKind();
      switch (kind) {
        case "Object":
          let proto = val.$Prototype;
          if (proto instanceof ObjectValue) {
            delayReason = this._shouldDelayValue(val.$Prototype);
            if (delayReason) return delayReason;
          }
          break;
        case "Date":
          invariant(val.$DateValue !== undefined);
          delayReason = this._shouldDelayValue(val.$DateValue);
          if (delayReason) return delayReason;
          break;
        default:
          break;
      }
    }

    return this.serializationStack.indexOf(val) >= 0;
  }

  _eagerOrDelay(values: Array<Value>, serializer: () => void) {
    let delayReason = this._shouldDelayValues(values);
    if (delayReason) {
      this._delay(delayReason, values, serializer);
    } else {
      serializer();
    }
  }

  _assignProperty(locationFn: () => BabelNodeLVal, valueFn: () => BabelNodeExpression, mightHaveBeenDeleted: boolean) {
    let assignment = t.expressionStatement(
      t.assignmentExpression("=", locationFn(), valueFn()));
    if (mightHaveBeenDeleted) {
      let condition = t.binaryExpression("!==", valueFn(), this.serializeValue(this.realm.intrinsics.empty));
      this.body.push(t.ifStatement(condition, assignment));
    } else {
      this.body.push(assignment);
    }
  }

  _serializeValueArray(name: string, val: ObjectValue, reasons: Array<string>): BabelNodeExpression {
    let realm = this.realm;
    let elems = [];

    let remainingProperties = new Map(val.properties);

    // If array length is abstract set it manually and then all known properties (including numeric indices)
    let lenProperty = Get(realm, val, "length");
    if (lenProperty instanceof AbstractValue) {
      this._eagerOrDelay([val], () => {
        this._assignProperty(
          () => t.memberExpression(this._getValIdForReference(val), t.identifier("length")),
          () => {
            return this.serializeValue(lenProperty, reasons.concat(`Abstract length of array ${name}`));
          },
          false /*mightHaveBeenDeleted*/);
        }
      );
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
          if (descriptor !== undefined && descriptor.value !== undefined) { // deleted
            remainingProperties.delete(key);
            if (this._canEmbedProperty(val, key, descriptor)) {
              let elemVal = descriptor.value;
              invariant(elemVal instanceof Value);
              let mightHaveBeenDeleted = elemVal.mightHaveBeenDeleted();
              let delayReason = this._shouldDelayValue(elemVal) || mightHaveBeenDeleted;
              if (delayReason) {
                // handle self recursion
                this._delay(delayReason, [elemVal, val], () => {
                  this._assignProperty(
                    () => t.memberExpression(this._getValIdForReference(val), t.numericLiteral(i), true),
                    () => {
                      invariant(elemVal !== undefined);
                      return this.serializeValue(elemVal, reasons.concat(`Declared in array ${name} at index ${key}`));
                    },
                    mightHaveBeenDeleted);
                });
              } else {
                elem = this.serializeValue(
                  elemVal,
                  reasons.concat(`Declared in array ${name} at index ${key}`)
                );
              }
            }
          }
        }
        elems.push(elem);
      }
    }

    this.addProperties(name, val, reasons, remainingProperties);
    return t.arrayExpression(elems);
  }

  _serializeValueMap(name: string, val: ObjectValue, reasons: Array<string>): BabelNodeExpression {
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

    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      let key = entry.$Key;
      let value = entry.$Value;
      if (key === undefined || value === undefined) continue;
      let mightHaveBeenDeleted = key.mightHaveBeenDeleted();
      let delayReason = this._shouldDelayValue(key) ||
        this._shouldDelayValue(value) || mightHaveBeenDeleted;
        if (delayReason) {
          // handle self recursion
          this._delay(delayReason, [key, value, val], () => {
            invariant(key !== undefined);
            invariant(value !== undefined);
            this.body.push(t.expressionStatement(
              t.callExpression(
                t.memberExpression(this._getValIdForReference(val), t.identifier("set")),
                [this.serializeValue(key, reasons.concat(`Set entry on ${name}`)),
                 this.serializeValue(value, reasons.concat(`Set entry on ${name}`))]
              )
            ));
          });
        } else {
          let serializedKey = this.serializeValue(key, reasons);
          let serializedValue = this.serializeValue(value, reasons.concat(`Set entry on ${name}`));
          let elem = t.arrayExpression([serializedKey, serializedValue]);
          elems.push(elem);
        }
    }

    this.addProperties(name, val, reasons, val.properties);
    let arrayValue = t.arrayExpression(elems);
    return t.newExpression(
      this.preludeGenerator.memoizeReference(kind), [arrayValue]);
  }

  _serializeValueSet(name: string, val: ObjectValue, reasons: Array<string>): BabelNodeExpression {
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

    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      if (entry === undefined) continue;
      let mightHaveBeenDeleted = entry.mightHaveBeenDeleted();
      let delayReason = this._shouldDelayValue(entry) || mightHaveBeenDeleted;
      if (delayReason) {
        // handle self recursion
        this._delay(delayReason, [entry, val], () => {
          invariant(entry !== undefined);
          this.body.push(t.expressionStatement(
            t.callExpression(
              t.memberExpression(this._getValIdForReference(val), t.identifier("add")),
              [this.serializeValue(entry, reasons.concat(`Added to ${name}`))]
            )
          ));
        });
      } else {
        let elem = this.serializeValue(
          entry,
          reasons.concat(`Added to ${name}`)
        );
        elems.push(elem);
      }
    }

    this.addProperties(name, val, reasons, val.properties);
    let arrayValue = t.arrayExpression(elems);
    return t.newExpression(
      this.preludeGenerator.memoizeReference(kind), [arrayValue]);
  }

  _serializeValueTypedArrayOrDataView(
    name: string,
    val: ObjectValue,
    reasons: Array<string>
  ): BabelNodeExpression {
    let buf = val.$ViewedArrayBuffer;
    invariant(buf !== undefined);
    let outlinedArrayBuffer = this.serializeValue(
      buf,
      reasons,
      true
    );
    this.addProperties(name, val, reasons, val.properties);
    return t.newExpression(
      this.preludeGenerator.memoizeReference(val.getKind()),
      [outlinedArrayBuffer]
    );
  }

  _serializeValueArrayBuffer(name: string, val: ObjectValue, reasons: Array<string>): BabelNodeExpression {
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

    this.addProperties(name, val, reasons, val.properties);
    if (allzero) {
      // if they're all zero, just emit the array buffer constructor
      return t.newExpression(
        this.preludeGenerator.memoizeReference(val.getKind()),
        [t.numericLiteral(len)],
      );
    } else {
      // initialize from a byte array otherwise
      let arrayValue = t.arrayExpression(elems);
      let consExpr = t.newExpression(
        this.preludeGenerator.memoizeReference("Uint8Array"),
        [arrayValue]
      );
      // access the Uint8Array.buffer property to extract the created buffer
      return t.memberExpression(consExpr, t.identifier("buffer"));
    }
  }

  _serializeValueFunction(name: string, val: FunctionValue, reasons: Array<string>): void | BabelNodeExpression {
    if (val instanceof BoundFunctionValue) {
      this.addProperties(name, val, reasons);
      return t.callExpression(
        t.memberExpression(
          this.serializeValue(val.$BoundTargetFunction, reasons.concat(`Bound by ${name}`)),
          t.identifier("bind")
        ),
        [].concat(
          this.serializeValue(val.$BoundThis, reasons.concat(`Bound this of ${name}`)),
          val.$BoundArguments.map((boundArg, i) => this.serializeValue(boundArg, reasons.concat(`Bound argument ${i} of ${name}`)))
        )
      );
    }

    if (val instanceof NativeFunctionValue) {
      throw new Error("TODO: do not know how to serialize non-intrinsic native function value");
    }

    let residualBindings = this.residualFunctionBindings.get(val);
    invariant(residualBindings);

    let serializedBindings = Object.create(null);
    let instance: FunctionInstance = {
      serializedBindings,
      functionValue: val,
      scopeInstances: new Set()
    };

    let delayed = 1;
    let undelay = () => {
      if (--delayed === 0) {
        instance.insertionPoint = this._getBodyReference();
        this.functionInstances.push(instance);

        let code = val.$ECMAScriptCode;
        invariant(code != null);
        let functionInstances = this.functions.get(code);
        if (functionInstances === undefined) this.functions.set(code, functionInstances = []);
        functionInstances.push(instance);
      }
    };
    for (let boundName in residualBindings) {
      let residualBinding = residualBindings[boundName];
      let referencedValues = [];
      let serializeBindingFunc;
      if (!residualBinding.declarativeEnvironmentRecord) {
        serializeBindingFunc = () => this._serializeGlobalBinding(boundName, residualBinding, name, reasons);
      } else {
        serializeBindingFunc = () => {
          return this._serializeDeclarativeEnvironmentRecordBinding(boundName, residualBinding, name, reasons);
        };
        invariant(residualBinding.value !== undefined);
        referencedValues.push(residualBinding.value);
      }
      delayed++;
      this._eagerOrDelay(referencedValues, () => {
        let serializedBinding = serializeBindingFunc();
        invariant(serializedBinding);
        serializedBindings[boundName] = serializedBinding;
        undelay();
      });
    }

    undelay();

    this.addProperties(name, val, reasons);
  }

  _canEmbedProperty(obj: ObjectValue, key: string, prop: Descriptor): boolean {
    if ((obj instanceof FunctionValue && key === "prototype") ||
        (obj.getKind() === "RegExp" && key === "lastIndex"))
    return !!prop.writable && !prop.configurable && !prop.enumerable && !prop.set && !prop.get;
    else
      return !!prop.writable && !!prop.configurable && !!prop.enumerable && !prop.set && !prop.get;
  }

  _findLastObjectPrototype(obj: ObjectValue): ObjectValue {
    while (obj.$Prototype instanceof ObjectValue) obj = obj.$Prototype;
    return obj;
  }

  _serializeValueObject(name: string, val: ObjectValue, reasons: Array<string>): BabelNodeExpression {
    // If this object is a prototype object that was implicitly created by the runtime
    // for a constructor, then we can obtain a reference to this object
    // in a special way that's handled alongside function serialization.
    let constructor = val.originalConstructor;
    if (constructor !== undefined) {
      let prototypeId = this.refs.get(val);
      invariant(prototypeId !== undefined);
      this._eagerOrDelay([constructor], () => {
        invariant(constructor !== undefined);
        invariant(prototypeId !== undefined);
        this.serializeValue(constructor, reasons.concat(`Constructor of object ${name}`));
        this.addProperties(name, val, reasons);
        this.functionPrototypes.set(constructor, prototypeId);
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
        this.addProperties(name, val, reasons);
        source = new RegExp(source).source; // add escapes as per 21.2.3.2.4
        return t.regExpLiteral(source, flags);
      case "Number":
        let numberData = val.$NumberData;
        invariant(numberData !== undefined);
        this.addProperties(name, val, reasons);
        return t.newExpression(this.preludeGenerator.memoizeReference("Number"), [t.numericLiteral(numberData.value)]);
      case "String":
        let stringData = val.$StringData;
        invariant(stringData !== undefined);
        this.addProperties(name, val, reasons);
        return t.newExpression(this.preludeGenerator.memoizeReference("String"), [t.stringLiteral(stringData.value)]);
      case "Boolean":
        let booleanData = val.$BooleanData;
        invariant(booleanData !== undefined);
        this.addProperties(name, val, reasons);
        return t.newExpression(this.preludeGenerator.memoizeReference("Boolean"), [t.booleanLiteral(booleanData.value)]);
      case "Date":
        let dateValue = val.$DateValue;
        invariant(dateValue !== undefined);
        let serializedDateValue = this.serializeValue(dateValue, reasons.concat(`[[DateValue]] of object ${name}`));
        this.addProperties(name, val, reasons);
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
        return this._serializeValueTypedArrayOrDataView(name, val, reasons);
      case "ArrayBuffer":
        return this._serializeValueArrayBuffer(name, val, reasons);
      case "Map":
      case "WeakMap":
        return this._serializeValueMap(name, val, reasons);
      case "Set":
      case "WeakSet":
        return this._serializeValueSet(name, val, reasons);
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
        let ignoredProperties = this.ignoredProperties.get(val);
        for (let [key, propertyBinding] of val.properties) {
          let descriptor = propertyBinding.descriptor;
          if (descriptor === undefined || descriptor.value === undefined) continue; // deleted
          if (!createViaAuxiliaryConstructor && this._canEmbedProperty(val, key, descriptor)) {
            remainingProperties.delete(key);
            let propValue = descriptor.value;
            invariant(propValue instanceof Value);
            if (ignoredProperties && ignoredProperties.has(key)) continue;
            let mightHaveBeenDeleted = propValue.mightHaveBeenDeleted();
            let delayReason = this._shouldDelayValue(propValue) || mightHaveBeenDeleted;
            if (delayReason) {
              // self recursion
              this._delay(delayReason, [propValue, val], () => {
                this._assignProperty(
                  () => {
                    let serializedKey = this.generator.getAsPropertyNameExpression(key);
                    return t.memberExpression(this._getValIdForReference(val), serializedKey, !t.isIdentifier(serializedKey));
                  },
                  () => {
                    invariant(propValue instanceof Value);
                    return this.serializeValue(propValue, reasons.concat(`Referenced in object ${name} with key ${key}`));
                  },
                  mightHaveBeenDeleted);
              });
            } else {
              let serializedKey = this.generator.getAsPropertyNameExpression(key);
              props.push(t.objectProperty(serializedKey, this.serializeValue(
                propValue,
                reasons.concat(`Referenced in object ${name} with key ${key}`)
              )));
            }
          }
        }

        this.addProperties(name, val, reasons, remainingProperties, createViaAuxiliaryConstructor);

        if (createViaAuxiliaryConstructor) {
          this.needsAuxiliaryConstructor = true;
          let serializedProto = this.serializeValue(proto, reasons.concat(`Referred to as the prototype for ${name}`));
          return t.sequenceExpression([
            t.assignmentExpression(
              "=",
              t.memberExpression(Serializer.constructorExpression, t.identifier("prototype")),
              serializedProto),
            t.newExpression(Serializer.constructorExpression, [])
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

  _serializeValueProxy(name: string, val: ProxyValue, reasons: Array<string>): BabelNodeExpression {
    return t.newExpression(this.preludeGenerator.memoizeReference("Proxy"), [
      this.serializeValue(val.$ProxyTarget, reasons.concat(`Proxy target of ${name}`)),
      this.serializeValue(val.$ProxyHandler, reasons.concat(`Proxy handler of ${name}`))
    ]);
  }

  _serializeAbstractValue(name: string, val: AbstractValue, reasons: Array<string>): BabelNodeExpression {
    invariant(val.kind !== "sentinel member expression", "invariant established by visitor");
    let serializedArgs = val.args.map((abstractArg, i) => this.serializeValue(abstractArg, reasons.concat(`Argument ${i} of ${name}`)));
    let serializedValue = val.buildNode(serializedArgs);
    if (serializedValue.type === "Identifier") {
      let id = ((serializedValue: any): BabelNodeIdentifier);
      invariant(!this.preludeGenerator.derivedIds.has(id.name) ||
        this.declaredDerivedIds.has(id));
    }
    return serializedValue;
  }

  _serializeValue(name: string, val: Value, reasons: Array<string>): void | BabelNodeExpression {
    if (val instanceof AbstractValue) {
      return this._serializeAbstractValue(name, val, reasons);
    } else if (val.isIntrinsic()) {
      return this._serializeValueIntrinsic(val);
    } else if (val instanceof EmptyValue) {
      this.needsEmptyVar = true;
      return Serializer.emptyExpression;
    } else if (val instanceof UndefinedValue) {
      return Serializer.voidExpression;
    } else if (ResidualHeapVisitor.isLeaf(val)) {
      return t.valueToNode(val.serialize());
    } else if (IsArray(this.realm, val)) {
      invariant(val instanceof ObjectValue);
      return this._serializeValueArray(name, val, reasons);
    } else if (val instanceof ProxyValue) {
      return this._serializeValueProxy(name, val, reasons);
    } else if (val instanceof FunctionValue) {
      return this._serializeValueFunction(name, val, reasons);
    } else if (val instanceof SymbolValue) {
      return this._serializeValueSymbol(val);
    } else if (val instanceof ObjectValue) {
      return this._serializeValueObject(name, val, reasons);
    } else {
      invariant(false);
    }
  }

  _serializeGlobalBinding(boundName: string, visitedBinding: VisitedBinding, functionName: string, reasons: Array<string>): SerializedBinding {
    invariant(!visitedBinding.declarativeEnvironmentRecord);
    if (boundName === "undefined") {
      // The global 'undefined' property is not writable and not configurable, and thus we can just use 'undefined' here,
      // encoded as 'void 0' to avoid the possibility of interference with local variables named 'undefined'.
      return { serializedValue: Serializer.voidExpression, value: undefined, modified: true, referentialized: true };
    }

    let value = this.realm.getGlobalLetBinding(boundName);
    // Check for let binding vs global property
    if (value) {
      let id = this.serializeValue(value, reasons.concat(`access in ${functionName} to global let binding ${boundName}`), true, "let");
      // increment ref count one more time as the value has been
      // referentialized (stored in a variable) by serializeValue
      this._incrementValToRefCount(value);
      return { serializedValue: id, value: undefined, modified: true, referentialized: true };
    } else {
      return { serializedValue: this.preludeGenerator.globalReference(boundName), value: undefined, modified: true, referentialized: true };
    }
  }

  _getSerializedBindingScopeInstance(serializedBinding: SerializedBinding): ScopeBinding {
    let declarativeEnvironmentRecord = serializedBinding.declarativeEnvironmentRecord;
    invariant(declarativeEnvironmentRecord);

    let scope = this.serializedScopes.get(declarativeEnvironmentRecord);
    if (!scope) {
      scope = {
        name: this.scopeNameGenerator.generate(),
        id: this.capturedScopeInstanceIdx++,
        initializationValues: new Map()
      };
      this.serializedScopes.set(declarativeEnvironmentRecord, scope);
    }

    serializedBinding.scope = scope;
    return scope;
  }

  _referentialize(names: Names, instances: Array<FunctionInstance>): void {
    for (let instance of instances) {
      let serializedBindings = instance.serializedBindings;

      for (let name in names) {
        let serializedBinding = serializedBindings[name];
        invariant(serializedBinding !== undefined);
        if (serializedBinding.modified) {

          // Initialize captured scope at function call instead of globally
          if (!serializedBinding.referentialized) {
            let scope = this._getSerializedBindingScopeInstance(serializedBinding);
            // Save the serialized value for initialization at the top of
            // the factory.
            // This can serialize more variables than are necessary to execute
            // the function because every function serializes every
            // modified variable of its parent scope. In some cases it could be
            // an improvement to split these variables into multiple
            // scopes.
            invariant(serializedBinding.serializedValue);
            scope.initializationValues.set(name, serializedBinding.serializedValue);

            // Replace binding usage with scope references
            serializedBinding.serializedValue = t.memberExpression(
                t.memberExpression(
                  t.identifier(GLOBAL_CAPTURED_SCOPE_NAME), t.identifier(scope.name), true),
                t.identifier(name), false);

            serializedBinding.referentialized = true;
            this.statistics.referentialized++;
          }

          // Already referentialized in prior scope
          if (serializedBinding.declarativeEnvironmentRecord) {
            invariant(serializedBinding.scope);
            instance.scopeInstances.add(serializedBinding.scope);
          }
        }
      }
    }
  }

  _getReferentializedScopeInitialization(scope: ScopeBinding): BabelNodeIfStatement {
    let properties = [];
    for (let [variableName, value] of scope.initializationValues.entries()) {
      properties.push(t.objectProperty(t.identifier(variableName), value));
    }

    return t.ifStatement(
        t.unaryExpression('!',
            t.memberExpression(
              t.identifier(GLOBAL_CAPTURED_SCOPE_NAME), t.identifier(scope.name), true)),
        t.expressionStatement(
          t.assignmentExpression(
            "=",
            t.memberExpression(
              t.identifier(GLOBAL_CAPTURED_SCOPE_NAME), t.identifier(scope.name), true),
            t.objectExpression(properties)
          )));
  }

  _spliceFunctions() {
    let functionBodies = new Map();
    function getFunctionBody(instance: FunctionInstance): Array<BabelNodeStatement> {
      let b = functionBodies.get(instance);
      if (b === undefined) functionBodies.set(instance, b = []);
      return b;
    }

    let requireStatistics = { replaced: 0, count: 0 };

    let functionEntries: Array<[BabelNodeBlockStatement, Array<FunctionInstance>]> = Array.from(this.functions.entries());
    this.statistics.functions = functionEntries.length;
    let hoistedBody = [];

    for (let [funcBody, instances] of functionEntries) {
      let functionInfo = this.residualFunctionInfos.get(funcBody);
      invariant(functionInfo);
      let { names, modified, usesThis, usesArguments } = functionInfo;
      let params = instances[0].functionValue.$FormalParameters;
      invariant(params !== undefined);

      this._referentialize(names, instances);

      let shouldInline = !funcBody;
      if (!shouldInline && funcBody.start && funcBody.end) {
        let bodySize = funcBody.end - funcBody.start;
        shouldInline = bodySize <= 30;
      }

      let define = (instance, funcNode) => {
        let body = funcNode.type === "FunctionDeclaration"
          ? hoistedBody
          : getFunctionBody(instance);
        body.push(funcNode);
        let { functionValue } = instance;
        let prototypeId = this.functionPrototypes.get(functionValue);
        if (prototypeId !== undefined) {
          let id = this._getValIdForReference(functionValue);
          body.push(t.variableDeclaration("var", [
            t.variableDeclarator(prototypeId,
              t.memberExpression(id, t.identifier("prototype")))
          ]));
        }
      };

      if (shouldInline || instances.length === 1 || usesArguments) {
        this.statistics.functionClones += instances.length - 1;

        for (let instance of instances) {
          let { functionValue, serializedBindings, scopeInstances } = instance;
          let id = this._getValIdForReference(functionValue);
          let funcParams = params.slice();
          let funcNode = t.functionDeclaration(id, funcParams, ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement));
          let scopeInitialization = [];
          for (let scope of scopeInstances) {
            scopeInitialization.push(t.variableDeclaration("var", [
              t.variableDeclarator(t.identifier(scope.name), t.numericLiteral(scope.id))
            ]));
            scopeInitialization.push(this._getReferentializedScopeInitialization(scope));
          }
          funcNode.body.body = scopeInitialization.concat(funcNode.body.body);

          traverse(
            t.file(t.program([funcNode])),
            ClosureRefReplacer,
            null,
            { serializedBindings,
              modified,
              requireReturns: this.requireReturns,
              requireStatistics,
              isRequire: this.modules.getIsRequire(funcParams, [functionValue]) }
          );

          if (functionValue.$Strict) {
            this.strictFunctionBodies.push(funcNode);
          } else {
            this.unstrictFunctionBodies.push(funcNode);
          }

          define(instance, funcNode);
        }
      } else {
        // Group instances with modified bindings
        let instanceBatches = [instances];
        for (let name in modified) {
          let newInstanceBatches = [];

          for (let batch of instanceBatches) {
            // Map from representative binding to function instances that use it
            let bindingLookup = new Map();

            for (let functionInstance of batch) {
              let serializedBinding = functionInstance.serializedBindings[name];
              invariant(serializedBinding !== undefined);
              let found = false;
              for (let [binding, group] of bindingLookup.entries()) {
                if (AreSameSerializedBindings(this.realm, serializedBinding, binding)) {
                  group.push(functionInstance);
                  found = true;
                  break;
                }
              }
              if (!found) {
                let matchingInstances = [functionInstance];
                bindingLookup.set(serializedBinding, matchingInstances);
                newInstanceBatches.push(matchingInstances);
              }
            }
          }
          instanceBatches = newInstanceBatches;
        }
        this.statistics.functionClones += instanceBatches.length - 1;

        for (instances of instanceBatches) {
          let suffix = instances[0].functionValue.__originalName || "";
          let factoryId = t.identifier(this.factoryNameGenerator.generate(suffix));

          // filter included variables to only include those that are different
          let factoryNames: Array<string> = [];
          let sameSerializedBindings = Object.create(null);
          for (let name in names) {
            let isDifferent = false;
            let lastBinding;

            if (instances[0].serializedBindings[name].modified) {
              // Must modify for traversal
              sameSerializedBindings[name] = instances[0].serializedBindings[name];
              continue;
            }

            for (let { serializedBindings } of instances) {
              let serializedBinding = serializedBindings[name];

              invariant(!serializedBinding.modified);
              if (!lastBinding) {
                lastBinding = serializedBinding;
              } else if (!AreSameSerializedBindings(this.realm, serializedBinding, lastBinding)) {
                isDifferent = true;
                break;
              }
            }

            if (isDifferent) {
              factoryNames.push(name);
            } else {
              invariant(lastBinding);
              sameSerializedBindings[name] = { serializedValue: lastBinding.serializedValue };
            }
          }
          //

          let factoryParams: Array<BabelNodeLVal> = [];
          for (let key of factoryNames) {
            factoryParams.push(t.identifier(key));
          }
          factoryParams = factoryParams.concat(params).slice();

          let scopeInitialization = [];
          for (let scope of instances[0].scopeInstances) {
            factoryParams.push(t.identifier(scope.name));
            scopeInitialization.push(this._getReferentializedScopeInitialization(scope));
          }

          // The Replacer below mutates the AST, so let's clone the original AST to avoid modifying it
          let factoryNode = t.functionDeclaration(factoryId, factoryParams, ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement));

          factoryNode.body.body = scopeInitialization.concat(factoryNode.body.body);

          this.prelude.push(factoryNode);

          traverse(
            t.file(t.program([factoryNode])),
            ClosureRefReplacer,
            null,
            { serializedBindings: sameSerializedBindings,
              modified,
              requireReturns: this.requireReturns,
              requireStatistics,
              isRequire: this.modules.getIsRequire(factoryParams, instances.map(instance => instance.functionValue)) }
          );

          for (let instance of instances) {
            let { functionValue, serializedBindings, insertionPoint } = instance;
            let functionId = this._getValIdForReference(functionValue);
            let flatArgs: Array<BabelNodeExpression> = factoryNames.map((name) => {
              let serializedValue = serializedBindings[name].serializedValue;
              invariant(serializedValue);
              return serializedValue;
            });
            let node;
            let firstUsage = this.firstFunctionUsages.get(functionValue);
            invariant(insertionPoint !== undefined);
            if (usesThis ||
                firstUsage !== undefined && !firstUsage.isNotEarlierThan(insertionPoint) ||
                this.functionPrototypes.get(functionValue) !== undefined) {
              let callArgs: Array<BabelNodeExpression | BabelNodeSpreadElement> = [t.thisExpression()];
              for (let flatArg of flatArgs) callArgs.push(flatArg);
              for (let param of params) {
                if (param.type !== "Identifier") {
                  throw new Error("TODO: do not know how to deal with non-Identifier parameters");
                }
                callArgs.push(((param: any): BabelNodeIdentifier));
              }

              for (let { id } of instance.scopeInstances) {
                callArgs.push(t.numericLiteral(id));
              }

              let callee = t.memberExpression(factoryId, t.identifier("call"));

              let childBody = t.blockStatement([
                t.returnStatement(t.callExpression(callee, callArgs))
              ]);

              node = t.functionDeclaration(functionId, params, childBody);
            } else {
              for (let { id } of instance.scopeInstances) {
                flatArgs.push(t.numericLiteral(id));
              }

              node = t.variableDeclaration("var", [
                t.variableDeclarator(functionId, t.callExpression(
                  t.memberExpression(factoryId, t.identifier("bind")),
                  [t.nullLiteral()].concat(flatArgs)
                ))
              ]);
            }

            define(instance, node);
          }
        }
      }
    }

    if (this.capturedScopeInstanceIdx) {
      let scopeVar = t.variableDeclaration("var", [
        t.variableDeclarator(
          t.identifier(GLOBAL_CAPTURED_SCOPE_NAME),
          t.callExpression(
            t.identifier("Array"),
            [t.numericLiteral(this.capturedScopeInstanceIdx)])
        )
      ]);
      this.prelude.unshift(scopeVar);
    }

    for (let instance of this.functionInstances.reverse()) {
      let functionBody = functionBodies.get(instance);
      if (functionBody !== undefined) {
        let insertionPoint = instance.insertionPoint;
        invariant(insertionPoint instanceof BodyReference);
        Array.prototype.splice.apply(insertionPoint.body, ([insertionPoint.index, 0]: Array<any>).concat((functionBody: Array<any>)));
      }
    }

    if (requireStatistics.replaced > 0 && !this.collectValToRefCountOnly) {
      console.log(`=== ${this.modules.initializedModules.size} of ${this.modules.moduleIds.size} modules initialized, ${requireStatistics.replaced} of ${requireStatistics.count} require calls inlined.`);
    }

    return hoistedBody;
  }

  _getContext(reasons: Array<string>): SerializationContext {
    // TODO #482: Values serialized by nested generators would currently only get defined
    // along the code of the nested generator; their definitions need to get hoisted
    // or repeated so that they are accessible and defined from all using scopes
    let bodies;
    return {
      reasons,
      serializeValue: this.serializeValue.bind(this),
      startBody: () => {
        if (bodies === undefined) bodies = [];
        bodies.push(this.body);
        let body = [];
        this.body = body;
        return body;
      },
      endBody: (body: Array<BabelNodeStatement>) => {
        invariant(body === this.body);
        invariant(bodies !== undefined);
        invariant(bodies.length > 0);
        this.body = bodies.pop();
      },
      announceDeclaredDerivedId: (id: BabelNodeIdentifier) => {
        this.declaredDerivedIds.add(id);
        let a = this.delayedKeyedSerializations.get(id);
        if (a !== undefined) {
          while (a.length) {
            invariant(this.serializationStack.length === 0);
            invariant(this.delayedSerializations.length === 0);
            let { values, func } = a.shift();
            this._eagerOrDelay(values, func);
          }
          this.delayedKeyedSerializations.delete(id);
        }
      }
    };
  }

  _emitGenerator(generator: Generator) {
    generator.serialize(this.body, this._getContext(["Root generator"]));
    invariant(this.delayedKeyedSerializations.size === 0);
  }

  _shouldBeWrapped(body: Array<any>) {
    for (let i = 0; i < body.length; i++){
      let item = body[i];
      if (item.type === "ExpressionStatement") {
        continue;
      } else if (item.type === "VariableDeclaration" || item.type === "FunctionDeclaration") {
        return true;
      } else if (item.type === "BlockStatement") {
        if (this._shouldBeWrapped(item.body)) {
          return true;
        }
      } else if (item.type === "IfStatement"){
        if (item.alternate){
          if (this._shouldBeWrapped(item.alternate.body)){
            return true;
          }
        }
        if (item.consequent){
          if (this._shouldBeWrapped(item.consequent.body)){
            return true;
          }
        }
      }
    }
    return false;
  }

  serialize(): AbstractSyntaxTree {
    this._emitGenerator(this.generator);
    invariant(this.declaredDerivedIds.size <= this.preludeGenerator.derivedIds.size);

    Array.prototype.push.apply(this.prelude, this.preludeGenerator.prelude);

    // TODO #20: add timers

    // TODO #21: add event listeners
    for (let [moduleId, moduleValue] of this.modules.initializedModules)
      this.requireReturns.set(moduleId, this.serializeValue(moduleValue));

    let hoistedBody = this._spliceFunctions();

    // add strict modes
    let strictDirective = t.directive(t.directiveLiteral("use strict"));
    let globalDirectives = [];
    if (!this.unstrictFunctionBodies.length && this.strictFunctionBodies.length) {
      // no unstrict functions, only strict ones
      globalDirectives.push(strictDirective);
    } else if (this.unstrictFunctionBodies.length && this.strictFunctionBodies.length) {
      // strict and unstrict functions
      funcLoop: for (let func of this.strictFunctionBodies) {
        if (func.body.directives) {
          for (let directive of func.body.directives) {
            if (directive.value.value === "use strict") {
              // already have a use strict directive
              continue funcLoop;
            }
          }
        } else
          func.body.directives = [];

        func.body.directives.unshift(strictDirective);
      }
    }

    // build ast
    let body = [];
    if (this.needsEmptyVar) {
      body.push(t.variableDeclaration("var", [
        t.variableDeclarator(
          Serializer.emptyExpression,
          t.objectExpression([])
        ),
      ]));
    }
    if (this.needsAuxiliaryConstructor) {
      body.push(t.functionDeclaration(
        Serializer.constructorExpression, [], t.blockStatement([])));
    }
    body = body.concat(this.prelude, hoistedBody, this.body);
    this.factorifyObjects(body);

    let ast_body = [];
    if (this.preludeGenerator.declaredGlobals.size > 0)
      ast_body.push(t.variableDeclaration("var",
        Array.from(this.preludeGenerator.declaredGlobals).map(key =>
          t.variableDeclarator(t.identifier(key)))));
    if (body.length) {
      if (this.realm.isCompatibleWith('node-source-maps')) {
        ast_body.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(
                t.callExpression(
                  t.identifier("require"),
                  [t.stringLiteral("source-map-support")]
                ),
                t.identifier("install")
              ),
              []
            )
          )
        );
      }

      if (this._shouldBeWrapped(body)){
        let globalExpression = this.realm.isCompatibleWith("node-cli") ?
          t.identifier("global") :
          t.thisExpression();

        let functionExpression = t.functionExpression(null, [], t.blockStatement(body, globalDirectives));
        let callExpression = this.preludeGenerator.usesThis
          ? t.callExpression(
              t.memberExpression(functionExpression, t.identifier("call")),
              [globalExpression]
            )
          : t.callExpression(functionExpression, []);
        ast_body.push(t.expressionStatement(callExpression));
      } else {
        ast_body = body;
      }
    }

    let ast = {
      type: "File",
      program: {
        type: "Program",
        body: ast_body
      }
    };

    invariant(this.serializedValues.size === this.residualValues.size);
    return ast;
  }

  getObjectKeys(obj: BabelNodeObjectExpression): string | false {
    let keys = [];

    for (let prop of obj.properties) {
      if (prop.type !== "ObjectProperty") return false;

      let key = prop.key;
      if (key.type === "StringLiteral") {
        keys.push(key.value);
      } else if (key.type === "Identifier") {
        if (prop.computed) return false;
        keys.push(key.name);
      } else {
        return false;
      }
    }

    for (let key of keys) {
      if (key.indexOf("|") >= 0) return false;
    }

    return keys.join("|");
  }

  factorifyObjects(body: Array<BabelNodeStatement>) {
    let signatures = Object.create(null);

    for (let node of body) {
      if (node.type !== "VariableDeclaration") continue;

      for (let declar of node.declarations) {
        let { init } = declar;
        invariant(init);
        if (init.type !== "ObjectExpression") continue;

        let keys = this.getObjectKeys(init);
        if (!keys) continue;

        let declars = signatures[keys] = signatures[keys] || [];
        declars.push(declar);
      }
    }

    for (let signatureKey in signatures) {
      let declars = signatures[signatureKey];
      if (declars.length < 5) continue;

      let keys = signatureKey.split("|");

      //
      let rootFactoryParams: Array<BabelNodeLVal> = [];
      let rootFactoryProps = [];
      for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
        let key = keys[keyIndex];
        let id = t.identifier(`__${keyIndex}`);
        rootFactoryParams.push(id);
        let keyNode = t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key);
        rootFactoryProps.push(t.objectProperty(keyNode, id));
      }

      let rootFactoryId = t.identifier(this.factoryNameGenerator.generate("root"));
      let rootFactoryBody = t.blockStatement([
        t.returnStatement(t.objectExpression(rootFactoryProps))
      ]);
      let rootFactory = t.functionDeclaration(rootFactoryId, rootFactoryParams, rootFactoryBody);
      body.unshift(rootFactory);

      //
      for (let declar of declars) {
        let args = [];
        for (let prop of declar.init.properties) {
          args.push(prop.value);
        }

        declar.init = t.callExpression(rootFactoryId, args);
      }

      //
      let seen = new Set();
      for (let declar of declars) {
        if (seen.has(declar)) continue;

        // build up a map containing the arguments that are shared
        let common = new Map();
        let mostSharedArgsLength = 0;
        for (let declar2 of declars) {
          if (seen.has(declar2)) continue;
          if (declar === declar2) continue;

          let sharedArgs = [];
          for (let i = 0; i < keys.length; i++) {
            if (isSameNode(declar.init.arguments[i], declar2.init.arguments[i])) {
              sharedArgs.push(i);
            }
          }
          if (!sharedArgs.length) continue;

          mostSharedArgsLength = Math.max(mostSharedArgsLength, sharedArgs.length);
          common.set(declar2, sharedArgs);
        }

        // build up a mapping of the argument positions that are shared so we can pick the top one
        let sharedPairs = Object.create(null);
        for (let [declar2, args] of common.entries()) {
          if (args.length === mostSharedArgsLength) {
            args = args.join(",");
            let pair = sharedPairs[args] = sharedPairs[args] || [];
            pair.push(declar2);
          }
        }

        // get the highest pair
        let highestPairArgs;
        let highestPairCount;
        for (let pairArgs in sharedPairs) {
          let pair = sharedPairs[pairArgs];
          if (!highestPairArgs || pair.length > highestPairCount) {
            highestPairCount = pair.length;
            highestPairArgs = pairArgs;
          }
        }
        if (!highestPairArgs) continue;

        //
        let declarsSub = sharedPairs[highestPairArgs].concat(declar);
        let removeArgs = highestPairArgs.split(",");

        let subFactoryArgs = [];
        let subFactoryParams = [];
        let sharedArgs = declarsSub[0].init.arguments;
        for (let i = 0; i < sharedArgs.length; i++) {
          let arg = sharedArgs[i];
          if (removeArgs.indexOf(i + "") >= 0) {
            subFactoryArgs.push(arg);
          } else {
            let id = t.identifier(`__${i}`);
            subFactoryArgs.push(id);
            subFactoryParams.push(id);
          }
        }

        let subFactoryId = t.identifier(this.factoryNameGenerator.generate("sub"));
        let subFactoryBody = t.blockStatement([
          t.returnStatement(t.callExpression(rootFactoryId, subFactoryArgs))
        ]);
        let subFactory = t.functionDeclaration(subFactoryId, subFactoryParams, subFactoryBody);
        body.unshift(subFactory);

        for (let declarSub of declarsSub) {
          seen.add(declarSub);

          let call = declarSub.init;
          call.callee = subFactoryId;
          call.arguments = call.arguments.filter(function (val, i) {
            return removeArgs.indexOf(i + "") < 0;
          });
        }
      }
    }
  }

  init(filename: string, code: string, map?: string = "",
      sourceMaps?: boolean = false, onError?: (Realm, Value) => void) {
    // Phase 1: Let's interpret.
    if (this.options.profile) console.time("[Profiling] Interpreting Global Code");
    this.execute(filename, code, map, onError);
    if (this.options.profile) console.timeEnd("[Profiling] Interpreting Global Code");
    if (this.logger.hasErrors()) return undefined;
    if (this.options.profile) console.time("[Profiling] Resolving Initial Modules");
    this.modules.resolveInitializedModules();
    if (this.options.profile) console.timeEnd("[Profiling] Resolving Initial Modules");
    if (this.options.initializeMoreModules) {
      if (this.options.profile) console.time("[Profiling] Speculative Initialization");
      this.modules.initializeMoreModules();
      if (this.logger.hasErrors()) return undefined;
      if (this.options.profile) console.timeEnd("[Profiling] Speculative Initialization");
    }

    //Deep traversal of the heap to identify the necessary scope of residual functions
    if (this.options.profile) console.time("[Profiling] Deep Traversal of Heap");
    let residualHeapVisitor = new ResidualHeapVisitor(this.realm, this.logger, this.modules, this.requireReturns);
    residualHeapVisitor.visitRoots();
    if (this.logger.hasErrors()) return undefined;
    this.ignoredProperties = residualHeapVisitor.ignoredProperties;
    this.residualValues = new Set(residualHeapVisitor.values.keys());
    this.residualFunctionBindings = residualHeapVisitor.functionBindings;
    this.residualFunctionInfos = residualHeapVisitor.functionInfos;
    if (this.options.profile) console.timeEnd("[Profiling] Deep Traversal of Heap");

    // Phase 2: Let's serialize the heap and generate code.
    // Serialize for the first time in order to gather reference counts
    if (!this.options.singlePass) {
      if (this.options.profile) console.time("[Profiling] Reference Counts Pass");
      this.collectValToRefCountOnly = true;
      this.valToRefCount = new Map();
      this.serialize();
      if (this.logger.hasErrors()) return undefined;
      if (this.options.profile) console.timeEnd("[Profiling] Reference Counts Pass");
    }
    // Serialize for a second time, using reference counts to minimize number of generated identifiers
    this._resetSerializeStates();
    this.collectValToRefCountOnly = false;
    if (this.options.profile) console.time("[Profiling] Serialize Pass");
    let ast = this.serialize();
    let generated = generate(
        ast,
        { sourceMaps: sourceMaps, sourceFileName: filename },
        code);
    if (this.options.profile) console.timeEnd("[Profiling] Serialize Pass");
    invariant(!this.logger.hasErrors());
    if (this.options.logStatistics) this.statistics.log();
    return {
      code: generated.code,
      map: generated.map,
      statistics: this.statistics
    };
  }
}
