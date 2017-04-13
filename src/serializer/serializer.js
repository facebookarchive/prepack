/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { GlobalEnvironmentRecord, DeclarativeEnvironmentRecord } from "../environment.js";
import { Realm, ExecutionContext } from "../realm.js";
import type { RealmOptions, Descriptor, PropertyBinding } from "../types.js";
import { IsUnresolvableReference, ResolveBinding, ToLength, IsArray, HasProperty, Get } from "../methods/index.js";
import { Completion } from "../completions.js";
import { BoundFunctionValue, ProxyValue, SymbolValue, AbstractValue, EmptyValue, NumberValue, FunctionValue, Value, ObjectValue, PrimitiveValue, NativeFunctionValue, UndefinedValue } from "../values/index.js";
import { describeLocation } from "../intrinsics/ecma262/Error.js";
import * as t from "babel-types";
import type { BabelNode, BabelNodeExpression, BabelNodeStatement, BabelNodeIdentifier, BabelNodeBlockStatement, BabelNodeObjectExpression, BabelNodeStringLiteral, BabelNodeLVal, BabelNodeSpreadElement, BabelVariableKind, BabelNodeFunctionDeclaration } from "babel-types";
import { Generator, PreludeGenerator } from "../utils/generator.js";
import type { SerializationContext } from "../utils/generator.js";
import generate from "babel-generator";
// import { transform } from "babel-core";
import traverse from "babel-traverse";
import invariant from "../invariant.js";
import * as base62 from "base62";
import type { SerializedBinding, SerializedBindings, FunctionInfo, FunctionInstance, SerializerOptions } from "./types.js";
import { BodyReference, AreSameSerializedBindings } from "./types.js";
import { ClosureRefVisitor, ClosureRefReplacer } from "./visitors.js";
import { Logger } from "./logger.js";
import { Modules } from "./modules.js";
import { LoggingTracer } from "./LoggingTracer.js";

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
  constructor(realmOptions: RealmOptions = {}, serializerOptions: SerializerOptions = {}) {
    this.realm = new Realm(realmOptions);
    invariant(this.realm.isPartial);
    this.logger = new Logger(this.realm, !!serializerOptions.internalDebug);
    this.modules = new Modules(this.realm, this.logger);
    if (serializerOptions.trace) this.realm.tracers.push(new LoggingTracer(this.realm));

    let realmGenerator = this.realm.generator;
    invariant(realmGenerator);
    this.generator = realmGenerator;
    let realmPreludeGenerator = this.realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;

    this.initializeMoreModules = !!serializerOptions.initializeMoreModules;
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

    this.unstrictFunctionBodies = [];
    this.strictFunctionBodies = [];

    this.functions = new Map();
    this.functionInstances = [];
    this.refs = new Map();
    this.declaredDerivedIds = new Set();
    this.descriptors = new Map();
    this.needsEmptyVar = false;
    this.uidCounter = 0;
  }

  globalReasons: {
    [filename: string]: Array<string>
  };

  declarativeEnvironmentRecordsBindings: Map<DeclarativeEnvironmentRecord, SerializedBindings>;
  serializationStack: Array<Value>;
  delayedSerializations: Array<() => void>;
  delayedKeyedSerializations: Map<BabelNodeIdentifier, Array<{values: Array<Value>, func: () => void}>>;
  unstrictFunctionBodies: Array<BabelNodeFunctionDeclaration>;
  strictFunctionBodies: Array<BabelNodeFunctionDeclaration>;
  functions: Map<BabelNodeBlockStatement, FunctionInfo>;
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
  initializeMoreModules: boolean;
  uidCounter: number;
  logger: Logger;
  modules: Modules;

  _getBodyReference() {
    return new BodyReference(this.body, this.body.length);
  }

  execute(filename: string, code: string, map: string,
      onError: void | ((Realm, Value) => void)) {
    let realm = this.realm;
    let res = realm.$GlobalEnv.execute(code, filename, map);

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

  shouldInline(val: Value): boolean {
    if (val instanceof SymbolValue) {
      return false;
    }

    if (val instanceof AbstractValue && val.hasIdentifier()) {
      invariant(!this.preludeGenerator.derivedIds.has(val.getIdentifier()) ||
        this.declaredDerivedIds.has(val.getIdentifier()));
      return true;
    }

    if (val.isIntrinsic()) {
      return false;
    }

    return val instanceof PrimitiveValue;
  }

  generateUid(): string {
    let id = "_" + base62.encode(this.uidCounter++);
    return id;
  }

  isNumberWithValue(value: ?Value, n: number): boolean {
    return !!value && value instanceof NumberValue && value.value === n;
  }

  canIgnoreProperty(val: Value, key: BabelNode, desc: Descriptor) {
    if (IsArray(this.realm, val)) {
      if (t.isIdentifier(key, { name: "length" }) && desc.writable && !desc.enumerable && !desc.configurable) {
        // length property has the correct descriptor values
        return true;
      }
    } else if (val instanceof FunctionValue) {
      if (t.isIdentifier(key, { name: "length" }) && !desc.writable && !desc.enumerable && desc.configurable && this.isNumberWithValue(desc.value, val.getArity())) {
        // length property will be inferred already by the amount of parameters
        return true;
      }

      if (t.isIdentifier(key, { name: "name" })) {
        // TODO add the name to `node.id`. ensure that nothing inside can reference it
        return true;
      }

      // Properties `caller` and `arguments` are added to normal functions in non-strict mode to prevent TypeErrors.
      // Because they are autogenerated, they should be ignored.
      if (t.isIdentifier(key, { name: "arguments" }) || t.isIdentifier(key, { name: "caller" })) {
        if (!val.$Strict && desc.writable && !desc.enumerable && desc.configurable && desc.value instanceof UndefinedValue && val.$FunctionKind === 'normal')
          return true;
      }
    }

    if (val instanceof ObjectValue && t.isIdentifier(key, { name: "constructor" })) {
      // TODO only if this is a prototype and the constructor is the value of the root function
      //return true;
    }

    if (val instanceof ObjectValue && desc.value && desc.value.isIntrinsic()) {
      // TODO only when this prototype would already be set
      return true;
    }

    // ignore the `prototype` property when it consists of a plain javascript object
    if (val instanceof FunctionValue && t.isIdentifier(key, { name: "prototype" })) {
      // ensure that it's a plain object
      if (desc.value instanceof ObjectValue && desc.value.$Prototype === this.realm.intrinsics.ObjectPrototype) {
        let valueProperties = desc.value.properties;
        let keys = Array.from(valueProperties.keys());

        // ensure that it's only key is the constructor
        if (keys.length === 1 && keys[0] === "constructor") {
          let binding = valueProperties.get("constructor");
          invariant(binding !== undefined);
          let cdesc = binding.descriptor;
          if (cdesc === undefined) return false;
          //todo: check if cdesc is an abstract value that could be empty

          // ensure that the constructor descriptor is correct
          if (cdesc.configurable && !cdesc.enumerable && cdesc.writable && cdesc.value === val) {
            return true;
          }
        }
      }
    }

    return false;
  }

  addProperties(name: string, val: ObjectValue, ignoreEmbedded: boolean, reasons: Array<string>, alternateProperties: ?Map<string, PropertyBinding>) {
    let descriptors = [];

    for (let [key, propertyBinding] of alternateProperties || val.properties) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      descriptors.push([
        t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key),
        desc
      ]);
    }

    /*
    for (let symbol of val.symbols.keys()) {
      // TODO: serialize symbols
    }
    */

    let proto = val.$GetPrototypeOf();
    if (proto.isIntrinsic()) {
      // TODO: serialize modified prototypes that are intrinsic objects
      proto = null;
    }

    if (!descriptors.length && !proto) return;

    // inject properties
    for (let [key, desc] of descriptors) {
      if (this.canIgnoreProperty(val, key, desc)) continue;
      invariant(desc !== undefined);
      this._eagerOrDelay(this._getDescriptorValues(desc).concat(val), () => {
        invariant(desc !== undefined);
        return this._emitProperty(name, val, key, desc, ignoreEmbedded, reasons);
      });
    }

    // prototype
    if (proto) {
      this._eagerOrDelay([proto, val], () => {
        invariant(proto);
        let serializedProto = this.serializeValue(proto, reasons.concat(`Referred to as the prototype for ${name}`));
        let uid = this._getValIdForReference(val);
        if (this.realm.compatibility !== "jsc")
          this.body.push(t.expressionStatement(t.callExpression(
            this.preludeGenerator.memoizeReference("Object.setPrototypeOf"),
            [uid, serializedProto]
          )));
        else {
          this.body.push(t.expressionStatement(t.assignmentExpression(
            "=",
            t.memberExpression(uid, t.identifier("__proto__")),
            serializedProto
          )));
        }
      });
    }
  }

  _emitProperty(name: string, val: Value, key: BabelNodeIdentifier | BabelNodeStringLiteral, desc: Descriptor, ignoreEmbedded: boolean, reasons: Array<string>): void {
    if (this._canEmbedProperty(desc, true)) {
      let descValue = desc.value;
      invariant(descValue instanceof Value);
      if (ignoreEmbedded) return;

      let uid = this._getValIdForReference(val);
      this.body.push(t.expressionStatement(t.assignmentExpression(
        "=",
        t.memberExpression(uid, key, !t.isIdentifier(key)),
          this.serializeValue(
            descValue,
            reasons.concat(`Referred to in the object ${name} for the value ${((key: any): BabelNodeIdentifier).name || ((key: any): BabelNodeStringLiteral).value}`)
          )
      )));
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
        descriptorId = t.identifier(this.generateUid());
        let declar = t.variableDeclaration("var", [
          t.variableDeclarator(descriptorId, t.objectExpression(descProps))]);
        this.body.push(declar);
        this.descriptors.set(descriptorsKey, descriptorId);
      }

      for (let descKey of valKeys) {
        if (descKey in desc) {
          let descValue = desc[descKey] || this.realm.intrinsics.undefined;
          invariant(descValue instanceof Value);
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

      let keyRaw = key;
      if (t.isIdentifier(keyRaw)) keyRaw = t.stringLiteral(((keyRaw: any): BabelNodeIdentifier).name);

      let uid = this._getValIdForReference(val);
      this.body.push(t.expressionStatement(t.callExpression(
        this.preludeGenerator.memoizeReference("Object.defineProperty"),
        [uid, keyRaw, descriptorId]
      )));
    }
  }

  _serializeDeclarativeEnvironmentRecordBinding(r: DeclarativeEnvironmentRecord, n: string, functionName: string, reasons: Array<string>): SerializedBinding {
    let serializedBindings = this.declarativeEnvironmentRecordsBindings.get(r);
    if (!serializedBindings) {
      serializedBindings = Object.create(null);
      this.declarativeEnvironmentRecordsBindings.set(r, serializedBindings);
    }
    let serializedBinding: ?SerializedBinding = serializedBindings[n];
    if (!serializedBinding) {
      let realm = this.realm;
      let binding = r.bindings[n];
      // TODO: handle binding.deletable, binding.mutable
      let value = (binding.initialized && binding.value) || realm.intrinsics.undefined;
      let serializedValue = this.serializeValue(
        value,
        reasons.concat(`access in ${functionName} to ${n}`));
      serializedBinding = { serializedValue, value };
      serializedBindings[n] = serializedBinding;
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

    let ref = this._getValIdForReferenceOptional(val);
    if (ref) {
      return ref;
    }

    reasons = reasons || [];
    if (!referenceOnly && this.shouldInline(val)) {
      let res = this._serializeValue("", val, reasons);
      invariant(res !== undefined);
      return res;
    }

    let name = this.generateUid(val);
    let id = t.identifier(name);
    this.refs.set(val, id);
    this.serializationStack.push(val);
    let init = this._serializeValue(name, val, reasons);
    let result = id;
    this._incrementValToRefCount(val);

    if (reasons.length) {
      this.globalReasons[name] = reasons;
    }

    let refCount = this.valToRefCount.get(val);
    invariant(refCount !== undefined && refCount > 0);
    if (this.collectValToRefCountOnly ||
      refCount !== 1) {
       if (init) {
         let declar = t.variableDeclaration((bindingType ? bindingType : "var"), [
           t.variableDeclarator(id, init)
         ]);

         this.body.push(declar);
       }
     } else {
       if (init) {
         this.refs.delete(val);
         result = init;
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
    } else if (val instanceof FunctionValue) return false;
    else if (val instanceof AbstractValue) {
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

  _serializeValueArray(name: string, val: ObjectValue, reasons: Array<string>): BabelNodeExpression {
    let realm = this.realm;
    let elems = [];

    let remainingProperties = new Map();
    for (let [k, v] of val.properties) {
      remainingProperties.set(k, v);
    }

    // An array's length property cannot be redefined, so this won't run user code
    let len = ToLength(realm, Get(realm, val, "length"));
    for (let i = 0; i < len; i++) {
      let key = i + "";
      remainingProperties.delete(key);
      let elem;
      if (HasProperty(realm, val, key)) {
        let elemVal: void | Value = this.logger.tryQuery(() => Get(realm, val, key), undefined, true);
        if (elemVal === undefined) {
          elem = null;
        } else {
          let delayReason = this._shouldDelayValue(elemVal);
          if (delayReason) {
            // handle self recursion
            this._delay(delayReason, [elemVal], () => {
              invariant(elemVal !== undefined);
              let id = this._getValIdForReference(val);
              this.body.push(t.expressionStatement(t.assignmentExpression(
                "=",
                t.memberExpression(id, t.numericLiteral(i), true),
                this.serializeValue(
                  elemVal,
                  reasons.concat(`Declared in array ${name} at index ${key}`)
                )
              )));
            });
            elem = null;
          } else {
            elem = this.serializeValue(
              elemVal,
              reasons.concat(`Declared in array ${name} at index ${key}`)
            );
          }
        }
      } else {
        elem = null;
      }
      elems.push(elem);
    }

    this.addProperties(name, val, false, reasons, remainingProperties);
    return t.arrayExpression(elems);
  }

  _serializeValueFunction(name: string, val: FunctionValue, reasons: Array<string>): void | BabelNodeExpression {
    if (val instanceof BoundFunctionValue) {
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

    invariant(val.constructor === FunctionValue);
    invariant(val.$FormalParameters != null);
    invariant(val.$ECMAScriptCode != null);

    let functionInfo = this.functions.get(val.$ECMAScriptCode);

    if (!functionInfo) {
      functionInfo = {
        names: Object.create(null),
        modified: Object.create(null),
        instances: [],
        usesArguments: false,
        usesThis: false,
      };
      this.functions.set(val.$ECMAScriptCode, functionInfo);

      let state = { tryQuery: this.logger.tryQuery.bind(this.logger), val, reasons, name, functionInfo,
        map: functionInfo.names, realm: this.realm,
        requiredModules: this.modules.requiredModules,
        isRequire: this.modules.getIsRequire(val.$FormalParameters, [val]) };

      traverse(
        t.file(t.program([
          t.expressionStatement(
            t.functionExpression(
              null,
              val.$FormalParameters,
              val.$ECMAScriptCode
            )
          )
        ])),
        ClosureRefVisitor,
        null,
        state
      );

      if (val.isResidual && Object.keys(functionInfo.names).length) {
        this.logger.logError(`residual function ${describeLocation(this.realm, val, undefined, val.$ECMAScriptCode.loc) || "(unknown)"} refers to the following identifiers defined outside of the local scope: ${Object.keys(functionInfo.names).join(", ")}`);
      }
    }



    let serializedBindings = Object.create(null);
    let instance: FunctionInstance = {
      serializedBindings,
      functionValue: val,
    };
    let delayed = 0;
    for (let innerName in functionInfo.names) {
      let referencedValues = [];
      let serializeBindingFunc;
      let doesNotMatter = true;
      let reference = this.logger.tryQuery(
        () => ResolveBinding(this.realm, innerName, doesNotMatter, val.$Environment),
        undefined, true);
      if (reference === undefined) {
        serializeBindingFunc = () => this._serializeGlobalBinding(innerName);
      } else {
        invariant(!IsUnresolvableReference(this.realm, reference));
        let referencedBase = reference.base;
        let referencedName: string = (reference.referencedName: any);
        if (typeof referencedName !== "string") {
          throw new Error("TODO: do not know how to serialize reference with symbol");
        }
        if (reference.base instanceof GlobalEnvironmentRecord) {
          serializeBindingFunc = () => this._serializeGlobalBinding(referencedName);
        } else if (referencedBase instanceof DeclarativeEnvironmentRecord) {
          serializeBindingFunc = () => {
            invariant(referencedBase instanceof DeclarativeEnvironmentRecord);
            return this._serializeDeclarativeEnvironmentRecordBinding(referencedBase, referencedName, name, reasons);
          };
          let binding = referencedBase.bindings[referencedName];
          if (binding.initialized && binding.value) referencedValues.push(binding.value);
        } else {
          invariant(false);
        }
      }
      let delayReason = this._shouldDelayValues(referencedValues);
      if (delayReason) {
        delayed++;
        this._delay(delayReason, referencedValues, () => {
          let serializedBinding = serializeBindingFunc();
          invariant(serializedBinding);
          serializedBindings[innerName] = serializedBinding;
          invariant(functionInfo);
          if (functionInfo.modified[innerName]) serializedBinding.modified = true;
          if (--delayed === 0) {
            instance.bodyReference = this._getBodyReference();
            this.functionInstances.push(instance);
          }
        });
      } else {
        let serializedBinding = serializeBindingFunc();
        invariant(serializedBinding);
        serializedBindings[innerName] = serializedBinding;
        invariant(functionInfo);
        if (functionInfo.modified[innerName]) serializedBinding.modified = true;
      }
    }

    if (delayed === 0) {
      instance.bodyReference = this._getBodyReference();
      this.functionInstances.push(instance);
    }
    functionInfo.instances.push(instance);

    this.addProperties(name, val, false, reasons);
  }

  _canEmbedProperty(prop: Descriptor, configurable: boolean = true): boolean {
    return !!prop.writable && !!prop.configurable === configurable && !!prop.enumerable && !prop.set && !prop.get;
  }

  _serializeValueObject(name: string, val: ObjectValue, reasons: Array<string>): BabelNodeExpression {
    let props = [];

    for (let [key, propertyBinding] of val.properties) {
      let prop = propertyBinding.descriptor;
      if (prop === undefined || prop.value === undefined) continue; // deleted
      if (this._canEmbedProperty(prop)) {
        let propValue = prop.value;
        invariant(propValue instanceof Value);
        // TODO: revert this when unicode support added
        let keyIsAscii = /^[\u0000-\u007f]*$/.test(key);
        let keyNode = t.isValidIdentifier(key) && keyIsAscii ?
            t.identifier(key) : t.stringLiteral(key);
        let delayReason = this._shouldDelayValue(propValue);
        if (delayReason) {
          // self recursion
          this._delay(delayReason, [propValue], () => {
            invariant(propValue instanceof Value);
            let id = this._getValIdForReference(val);
            this.body.push(t.expressionStatement(t.assignmentExpression(
              "=",
              t.memberExpression(id, keyNode, t.isStringLiteral(keyNode)),
              this.serializeValue(
                propValue,
                reasons.concat(`Referenced in object ${name} with key ${key}`)
              )
            )));
          });
        } else {
          props.push(t.objectProperty(keyNode, this.serializeValue(
            propValue,
            reasons.concat(`Referenced in object ${name} with key ${key}`)
          )));
        }
      }
    }

    this.addProperties(name, val, true, reasons);
    if (val.$RegExpMatcher) {
      let source = val.$OriginalSource;
      let flags = val.$OriginalFlags;
      invariant(typeof source === "string");
      invariant(typeof flags === "string");
      return t.callExpression(t.identifier("RegExp"), [t.stringLiteral(source), t.stringLiteral(flags)]);
    } else {
      return t.objectExpression(props);
    }
  }

  _serializeValueSymbol(val: SymbolValue): BabelNodeExpression {
    let args = [];
    if (val.$Description) args.push(t.stringLiteral(val.$Description));
    return t.callExpression(t.identifier("Symbol"), args);
  }

  _serializeValueProxy(name: string, val: ProxyValue, reasons: Array<string>): BabelNodeExpression {
    return t.newExpression(t.identifier("Proxy"), [
      this.serializeValue(val.$ProxyTarget, reasons.concat(`Proxy target of ${name}`)),
      this.serializeValue(val.$ProxyHandler, reasons.concat(`Proxy handler of ${name}`))
    ]);
  }

  _serializeAbstractValue(name: string, val: AbstractValue, reasons: Array<string>): BabelNodeExpression {
    let serializedArgs = val.args.map((abstractArg, i) => this.serializeValue(abstractArg, reasons.concat(`Argument ${i} of ${name}`)));
    let serializedValue = val.buildNode(serializedArgs);
    if (serializedValue.type === "Identifier") {
      let id = ((serializedValue: any): BabelNodeIdentifier);
      invariant(!this.preludeGenerator.derivedIds.has(id) ||
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
      return t.identifier("__empty");
    } else if (this.shouldInline(val)) {
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

  _serializeGlobalBinding(key: string): void | SerializedBinding {
    if (t.isValidIdentifier(key)) {
      let value = this.realm.getGlobalLetBinding(key);
      // Check for let binding vs global property
      if (value) {
        let id = this.serializeValue(value, ["global let binding"], true, "let");
        // increment ref count one more time as the value has been
        // referentialized (stored in a variable) by serializeValue
        this._incrementValToRefCount(value);
        return {
          serializedValue: id,
          modified: true, referentialized: true
        };
      } else {
        return { serializedValue: t.identifier(key), modified: true, referentialized: true };
      }
    } else {
      return { serializedValue: t.stringLiteral(key), modified: true, referentialized: true };
    }
  }

  _spliceFunctions() {
    let functionBodies = new Map();
    function getFunctionBody(instance: FunctionInstance): Array<BabelNodeStatement> {
      let b = functionBodies.get(instance);
      if (b === undefined) functionBodies.set(instance, b = []);
      return b;
    }

    let requireStatistics = { replaced: 0, count: 0 };

    // Ensure that all bindings that actually get modified get proper variables
    let functionEntries: Array<[BabelNodeBlockStatement, FunctionInfo]> = Array.from(this.functions.entries());
    for (let [, { instances, names }] of functionEntries) {
      for (let instance of instances) {
        let serializedBindings = instance.serializedBindings;
        for (let name in names) {
          let serializedBinding: SerializedBinding = serializedBindings[name];
          if (serializedBinding.modified && !serializedBinding.referentialized) {
            let serializedBindingId = t.identifier(this.generateUid());
            let declar = t.variableDeclaration("var", [
              t.variableDeclarator(serializedBindingId, serializedBinding.serializedValue)]);
            getFunctionBody(instance).push(declar);
            serializedBinding.serializedValue = serializedBindingId;
            serializedBinding.referentialized = true;
          }
        }
      }
    }

    for (let [funcBody, { usesArguments, usesThis, instances, names, modified }] of functionEntries) {
      let params = instances[0].functionValue.$FormalParameters;

      let shouldInline = !funcBody;
      if (!shouldInline && funcBody.start && funcBody.end) {
        let bodySize = funcBody.end - funcBody.start;
        shouldInline = bodySize <= 30;
      }

      // TODO: instead of completely giving up creating factories if there are modified bindings,
      // figure out which instances share all they modified bindings, and then create factories for
      // those batches.
      let anySerializedBindingModified = false;
      for (let instance of instances) {
        let serializedBindings = instance.serializedBindings;
        for (let name in names) {
          let serializedBinding: SerializedBinding = serializedBindings[name];
          if (serializedBinding.modified) {
            anySerializedBindingModified = true;
          }
        }
      }

      if (shouldInline || instances.length === 1 || usesArguments || anySerializedBindingModified) {
        for (let instance of instances) {
          let { functionValue, serializedBindings } = instance;
          let id = this._getValIdForReference(functionValue);
          let funcParams = params.slice();
          let funcNode = t.functionDeclaration(id, funcParams, ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement));

          traverse(
            t.file(t.program([funcNode])),
            ClosureRefReplacer,
            null,
            { serializedBindings,
              modified,
              requireReturns: this.modules.requireReturns,
              requireStatistics,
              isRequire: this.modules.getIsRequire(funcParams, [functionValue]) }
          );

          if (functionValue.$Strict) {
            this.strictFunctionBodies.push(funcNode);
          } else {
            this.unstrictFunctionBodies.push(funcNode);
          }

          getFunctionBody(instance).push(funcNode);
        }
      } else {
        let factoryId = t.identifier(this.generateUid());

        // filter included variables to only include those that are different
        let factoryNames: Array<string> = [];
        let sameSerializedBindings = Object.create(null);
        for (let name in names) {
          let isDifferent = false;
          let lastBinding;

          for (let { serializedBindings } of instances) {
            let serializedBinding = serializedBindings[name];
            invariant(!serializedBinding.modified);
            if (!lastBinding) {
              lastBinding = serializedBinding;
            } else if (!AreSameSerializedBindings(serializedBinding, lastBinding)) {
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
        // The Replacer below mutates the AST, so let's clone the original AST to avoid modifying it
        let factoryNode = t.functionDeclaration(factoryId, factoryParams, ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement));
        this.prelude.push(factoryNode);

        traverse(
          t.file(t.program([factoryNode])),
          ClosureRefReplacer,
          null,
          { serializedBindings: sameSerializedBindings,
            modified,
            requireReturns: this.modules.requireReturns,
            requireStatistics,
            isRequire: this.modules.getIsRequire(factoryParams, instances.map(instance => instance.functionValue)) }
        );

        //

        for (let instance of instances) {
          let { functionValue, serializedBindings } = instance;
          let id = this._getValIdForReference(functionValue);
          let flatArgs: Array<BabelNodeExpression> = factoryNames.map((name) => serializedBindings[name].serializedValue);
          let node;
          if (usesThis) {
            let callArgs: Array<BabelNodeExpression | BabelNodeSpreadElement> = [t.thisExpression()];
            for (let flatArg of flatArgs) callArgs.push(flatArg);
            for (let param of params) {
              if (param.type !== "Identifier") {
                throw new Error("TODO: do not know how to deal with non-Identifier parameters");
              }
              callArgs.push(((param: any): BabelNodeIdentifier));
            }
            let callee = t.memberExpression(factoryId, t.identifier("call"));

            let childBody = t.blockStatement([
              t.returnStatement(t.callExpression(callee, callArgs))
            ]);

            node = t.functionDeclaration(id, params, childBody);
          } else {
            node = t.variableDeclaration("var", [
              t.variableDeclarator(id, t.callExpression(
                t.memberExpression(factoryId, t.identifier("bind")),
                [t.nullLiteral()].concat(flatArgs)
              ))
            ]);
          }
          getFunctionBody(instance).push(node);
        }
      }
    }

    for (let instance of this.functionInstances.reverse()) {
      let functionBody = functionBodies.get(instance);
      invariant(functionBody !== undefined);
      let bodyReference = instance.bodyReference;
      invariant(bodyReference instanceof BodyReference);
      invariant(bodyReference.index >= 0);
      Array.prototype.splice.apply(bodyReference.body, ([bodyReference.index, 0]: Array<any>).concat((functionBody: Array<any>)));
    }

    if (requireStatistics.replaced > 0 && !this.collectValToRefCountOnly) {
      console.log(`=== ${this.modules.requireReturns.size} of ${this.modules.requiredModules.size} modules initialized, ${requireStatistics.replaced} of ${requireStatistics.count} require calls inlined.`);
    }
  }

  _getContext(reasons: Array<string>): SerializationContext {
    // TODO: Values serialized by nested generators would currently only get defined
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

  serialize(filename: string, code: string, sourceMaps: boolean): { anyHeapChanges?: boolean, generated?: { code: string, map?: string } } {
    let realm = this.realm;

    this._emitGenerator(this.generator);
    invariant(this.declaredDerivedIds.size <= this.preludeGenerator.derivedIds.size);

    Array.prototype.push.apply(this.prelude, this.preludeGenerator.prelude);

    // TODO serialize symbols
    // for (let symbol of globalObj.symbols.keys());

    // TODO add timers

    // TODO add event listeners

    this.modules.resolveRequireReturns(this._getContext(["Require returns"]));
    if (this.initializeMoreModules) {
      // Note: This may mutate heap state, and render
      if (this.modules.initializeMoreModules()) return { anyHeapChanges: true };
    }
    this._spliceFunctions();

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
      body = [(t.variableDeclaration("var", [
        t.variableDeclarator(
          t.identifier("__empty"),
          t.objectExpression([])
        ),
      ]))];
    }
    body = body.concat(this.prelude, this.body);
    this.factorifyObjects(body);

    let ast_body = [];
    if (body.length) {
      if (realm.compatibility === 'node') {
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

      ast_body.push(
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(
              t.functionExpression(null, [], t.blockStatement(body, globalDirectives)),
              t.identifier("call")
            ),
            [t.thisExpression()]
          )
        )
      );
    }

    let ast = {
      type: "File",
      program: {
        type: "Program",
        body: ast_body
      }
    };

    return {
      generated: generate(
        ast,
        { sourceMaps: sourceMaps, sourceFileName: filename },
        code)
    };
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
    // TODO clean this up...
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
      for (let key of keys) rootFactoryParams.push(t.identifier(key));

      let rootFactoryProps = [];
      for (let key of keys) {
        let keyNode = t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key);
        rootFactoryProps.push(t.objectProperty(keyNode, t.identifier(key)));
      }

      let rootFactoryId = t.identifier(this.generateUid());
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
            let id = t.identifier("__" + i);
            subFactoryArgs.push(id);
            subFactoryParams.push(id);
          }
        }

        let subFactoryId = t.identifier(this.generateUid());
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
    this.execute(filename, code, map, onError);
    if (this.logger.hasErrors()) return undefined;
    let anyHeapChanges = true;
    this.collectValToRefCountOnly = true;
    while (anyHeapChanges) {
      this.valToRefCount = new Map();
      anyHeapChanges = !!this.serialize(filename, code, sourceMaps).anyHeapChanges;
      if (this.logger.hasErrors()) return undefined;
      this._resetSerializeStates();
      this.initializeMoreModules = false; // no need to do it again
    }
    this.collectValToRefCountOnly = false;
    let serialized = this.serialize(filename, code, sourceMaps);
    invariant(!serialized.anyHeapChanges);
    invariant(!this.logger.hasErrors());
    return serialized.generated;
  }
}
