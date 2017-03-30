/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { GlobalEnvironmentRecord, DeclarativeEnvironmentRecord } from "./environment.js";
import { Realm, ExecutionContext } from "./realm.js";
import type { RealmOptions, Descriptor } from "./types.js";
import { IsUnresolvableReference, ResolveBinding, ToLength, IsArray, HasProperty, ToStringPartial, Get, InstanceofOperator, IsIntrospectionErrorCompletion } from "./methods/index.js";
import { Completion, AbruptCompletion, ThrowCompletion } from "./completions.js";
import { BoundFunctionValue, ProxyValue, SymbolValue, AbstractValue, EmptyValue, NumberValue, FunctionValue, Value, ObjectValue, PrimitiveValue, StringValue, NativeFunctionValue, UndefinedValue } from "./values/index.js";
import { describeLocation } from "./intrinsics/ecma262/Error.js";
import * as t from "babel-types";
import type { BabelNode, BabelNodeExpression, BabelNodeStatement, BabelNodeIdentifier, BabelNodeBlockStatement, BabelNodeObjectExpression, BabelNodeStringLiteral, BabelNodeLVal, BabelNodeSpreadElement, BabelNodeCallExpression, BabelVariableKind, BabelNodeFunctionDeclaration } from "babel-types";
import { Generator, PreludeGenerator } from "./utils/generator.js";
import generate from "babel-generator";
// import { transform } from "babel-core";
import traverse from "babel-traverse";
import invariant from "./invariant.js";
import * as base62 from "base62";

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

function markVisited(node, data) {
  node._renamedOnce = data;
}

function shouldVisit(node, data) {
  return node._renamedOnce !== data;
}

// replaceWith causes the node to be re-analysed, so to prevent double replacement
// we add this property on the node to mark it such that it does not get replaced
// again on this pass
// TODO: Make this work when replacing with arbitrary BabelNodeExpressions. Currently
//       if the node that we're substituting contains identifiers as children,
//       they will be visited again and possibly transformed.
//       If necessary we could implement this by following node.parentPath and checking
//       if any parent nodes are marked visited, but that seem unnecessary right now.let closureRefReplacer = {
let closureRefReplacer = {
  ReferencedIdentifier(path, state) {
    let serialisedBindings = state.serialisedBindings;
    let innerName = path.node.name;
    if (path.scope.hasBinding(innerName, /*noGlobals*/true)) return;

    let serialisedBinding = serialisedBindings[innerName];
    if (serialisedBinding && shouldVisit(path.node, serialisedBindings)) {
      markVisited(serialisedBinding.serialisedValue, serialisedBindings);
      path.replaceWith(serialisedBinding.serialisedValue);
    }
  },

  CallExpression(path, state) {
    // Here we apply the require optimization by replacing require calls with their
    // corresponding initialized modules.
    let requireReturns = state.requireReturns;
    if (!state.isRequire || !state.isRequire(path.scope, path.node)) return;
    state.requireStatistics.count++;
    if (state.modified[path.node.callee.name]) return;

    let moduleId = path.node.arguments[0].value;
    let new_node = requireReturns.get(moduleId);
    if (new_node !== undefined) {
      markVisited(new_node, state.serialisedBindings);
      path.replaceWith(new_node);
      state.requireStatistics.replaced++;
    }
  },

  "AssignmentExpression|UpdateExpression"(path, state) {
    let serialisedBindings = state.serialisedBindings;
    let ids = path.getBindingIdentifierPaths();

    for (let innerName in ids) {
      let nestedPath = ids[innerName];
      if (path.scope.hasBinding(innerName, /*noGlobals*/true)) return;

      let serialisedBinding = serialisedBindings[innerName];
      if (serialisedBinding && shouldVisit(nestedPath.node, serialisedBindings)) {
        markVisited(serialisedBinding.serialisedValue, serialisedBindings);
        nestedPath.replaceWith(serialisedBinding.serialisedValue);
      }
    }
  }
};

function visitName(state, name, modified) {
  let doesNotMatter = true;
  let ref = state.serialiser.tryQuery(
    () => ResolveBinding(state.realm, name, doesNotMatter, state.val.$Environment),
    undefined, true);
  if (ref === undefined) return;
  if (IsUnresolvableReference(state.realm, ref)) return;
  state.map[name] = true;
  if (modified) state.functionInfo.modified[name] = true;
}

// TODO doesn't check that `arguments` and `this` is in top function
let closureRefVisitor = {
  ReferencedIdentifier(path, state) {
    let innerName = path.node.name;
    if (innerName === "arguments") {
      state.functionInfo.usesArguments = true;
      return;
    }
    if (path.scope.hasBinding(innerName, /*noGlobals*/true)) return;
    visitName(state, innerName, false);
  },

  ThisExpression(path, state) {
    state.functionInfo.usesThis = true;
  },

  CallExpression(path, state) {
    /*
    This optimization replaces requires to initialized modules with their return
    values. It does this by checking whether the require call has any side effects
    (e.g. modifications to the global module table). Conceptually if a call has
    no side effects, it should be safe to replace with its return value.

    This optimization is not safe in general because it allows for reads to mutable
    global state, but in the case of require, the return value is guaranteed to always
    be the same regardless of that global state modification (because we should
    only be reading from the global module table).
    */
    if (!state.isRequire || !state.isRequire(path.scope, path.node)) return;

    let moduleId = path.node.arguments[0].value;
    state.requiredModules.add(moduleId);
  },

  "AssignmentExpression|UpdateExpression"(path, state) {
    for (let name in path.getBindingIdentifiers()) {
      if (path.scope.hasBinding(name, /*noGlobals*/true)) continue;
      visitName(state, name, true);
    }
  }
};

type FunctionInstance = {
  serialisedBindings: SerialisedBindings;
  functionValue: FunctionValue;
  bodyIndex: number;
};

type FunctionInfo = {
  names: { [key: string]: true };
  modified: { [key: string]: true };
  instances: Array<FunctionInstance>;
  usesArguments: boolean;
  usesThis: boolean;
}

type SerialisedBindings = { [key: string]: SerialisedBinding };
type SerialisedBinding = {
  serialisedValue: BabelNodeExpression;
  value?: Value;
  referentialised?: boolean;
  modified?: boolean;
}

function AreSameSerialisedBindings(x, y) {
  if (x.serialisedValue === y.serialisedValue) return true;
  if (x.value && x.value === y.value) return true;
  return false;
}

export default class Serialiser {
  constructor(opts: RealmOptions = {}, initialiseMoreModules: boolean = true) {
    this.origOpts = opts;
    this.realm = new Realm(opts);
    invariant(this.realm.isPartial);

    let realmGenerator = this.realm.generator;
    invariant(realmGenerator);
    this.generator = realmGenerator;
    let realmPreludeGenerator = this.realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;

    this.initialiseMoreModules = initialiseMoreModules;
    this.requiredModules = new Set();
    this._resetSerializeStates();
  }

  _resetSerializeStates() {
    this.declarativeEnvironmentRecordsBindings = new Map();
    this.serialisationStack = [];
    this.delayedSerialisations = [];
    this.delayedKeyedSerialisations = new Map();
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

  origOpts: RealmOptions;
  declarativeEnvironmentRecordsBindings: Map<DeclarativeEnvironmentRecord, SerialisedBindings>;
  serialisationStack: Array<Value>;
  delayedSerialisations: Array<() => void>;
  delayedKeyedSerialisations: Map<BabelNodeIdentifier, Array<{values: Array<Value>, func: () => void}>>;
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
  _hasErrors: boolean;
  preludeGenerator: PreludeGenerator;
  generator: Generator;
  requiredModules: Set<number | string>;
  descriptors: Map<string, BabelNodeIdentifier>;
  needsEmptyVar: boolean;
  require: Value;
  requireReturns: Map<number | string, BabelNodeExpression>;
  initialiseMoreModules: boolean;
  uidCounter: number;

  // Wraps a query that might potentially execute user code.
  tryQuery<T>(f: () => T, onCompletion: T | (Completion => T), logCompletion: boolean): T {
    let context = new ExecutionContext();
    let realm = this.realm;
    let env = realm.$GlobalEnv;
    context.lexicalEnvironment = env;
    context.variableEnvironment = env;
    context.realm = realm;
    realm.contextStack.push(context);
    // We use partial evaluation so that we can throw away any state mutations
    try {
      let result;
      let effects = realm.internal_partially_evaluate(() => {
        try {
          result = f();
        } catch (e) {
          if (e instanceof Completion) {
            if (logCompletion) this.logCompletion(e);
            result = onCompletion instanceof Function ? onCompletion(e) : onCompletion;
          } else {
            throw e;
          }
        }
        return realm.intrinsics.undefined;
      });
      invariant(effects[0] === realm.intrinsics.undefined);
      return ((result: any): T);
    } finally {
      realm.contextStack.pop();
    }
  }

  _getIsRequire(formalParameters: Array<BabelNodeLVal>, functions: Array<FunctionValue>) {
    let realm = this.realm;
    let globalRequire = this.require;
    let serialiser = this;
    return function (scope: any, node: BabelNodeCallExpression) {
      if (!t.isIdentifier(node.callee) ||
        node.arguments.length !== 1 ||
        !node.arguments[0]) return false;
      let argument = node.arguments[0];
      if (!t.isNumericLiteral(argument) && !t.isStringLiteral(argument)) return false;

      invariant(node.callee);
      let innerName = ((node.callee: any): BabelNodeIdentifier).name;

      for (let f of functions) {
        let scopedBinding = scope.getBinding(innerName);
        if (scopedBinding) {
          if (realm.annotations.get(f) === "FACTORY_FUNCTION" && formalParameters[1] === scopedBinding.path.node) {
            invariant(scopedBinding.kind === "param");
            continue;
          }
          // The name binds to some local entity, but nothing we'd know what exactly it is
          return false;
        }

        let doesNotMatter = true;
        let reference = serialiser.tryQuery(
          () => ResolveBinding(realm, innerName, doesNotMatter, f.$Environment),
          undefined, false);
        if (reference === undefined) {
          // We couldn't resolve as we came across some behavior that we cannot deal with abstractly
          return false;
        }
        if (IsUnresolvableReference(realm, reference)) return false;
        let referencedBase = reference.base;
        let referencedName: string = (reference.referencedName: any);
        if (typeof referencedName !== "string") return false;
        let value;
        if (reference.base instanceof GlobalEnvironmentRecord) value = Get(realm, realm.$GlobalObject, innerName);
        else {
          invariant(referencedBase instanceof DeclarativeEnvironmentRecord);
          let binding = referencedBase.bindings[referencedName];
          if (!binding.initialized) return false;
          value = binding.value;
        }
        if (value !== globalRequire) return false;
      }

      return true;
    };
  }

  logCompletion(res: Completion) {
    let realm = this.realm;
    let value = res.value;
    console.error(`=== ${res.constructor.name} ===`);
    if (this.tryQuery(() => value instanceof ObjectValue && InstanceofOperator(realm, value, realm.intrinsics.Error), false, false)) {
      let object = ((value: any): ObjectValue);
      try {
        let err = new Error(this.tryQuery(() => ToStringPartial(realm, Get(realm, object, "message")), "(unknown message)", false));
        err.stack = this.tryQuery(() => ToStringPartial(realm, Get(realm, object, "stack")), "(unknown stack)", false);
        console.error(err.message);
        console.error(err.stack);
        if (res instanceof ThrowCompletion) console.error(res.nativeStack);
      } catch (err) {
        let message = object.properties.get("message");
        console.error((message && message.descriptor && message.descriptor.value instanceof StringValue) ? message.descriptor.value.value : "(no message available)");
        console.error(err.stack);
        console.error(object.$ContextStack);
      }
    } else {
      try {
        value = ToStringPartial(realm, value);
      } catch (err) {
        value = err.message;
      }
      console.error(value);
      if (res instanceof ThrowCompletion) console.error(res.nativeStack);
    }
    this._hasErrors = true;
  }

  logError(message: string) {
    console.error(message);
    this._hasErrors = true;
  }

  execute(filename: string, code: string, map: string,
      onError: void | ((Realm, Value) => void)) {
    let realm = this.realm;
    let res = realm.$GlobalEnv.execute(code, filename, map);

    if (res instanceof Completion) {
      let context = new ExecutionContext();
      realm.contextStack.push(context);
      try {
        if (onError) {
          onError(realm, res.value);
        }
        this.logCompletion(res);
      } finally {
        realm.contextStack.pop();
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

  addProperties(name: string, val: ObjectValue, ignoreEmbedded: boolean, reasons: Array<string>) {
    let descriptors = [];

    for (let [key, propertyBinding] of val.properties) {
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
      // TODO: serialise symbols
    }
    */

    let proto = val.$GetPrototypeOf();
    if (proto.isIntrinsic()) {
      // TODO: serialise modified prototypes that are intrinsic objects
      proto = null;
    }

    if (!descriptors.length && !proto) return;

    // inject properties
    for (let [key, desc] of descriptors) {
      if (this.canIgnoreProperty(val, key, desc)) continue;
      invariant(desc !== undefined);
      this._eagerOrDelay(this._getDescriptorValues(desc).concat(val), () => {
        let uid = this._getValIdForReference(val);
        invariant(desc !== undefined);
        return this._emitProperty(name, uid, key, desc, ignoreEmbedded, reasons);
      });
    }

    // prototype
    if (proto) {
      this._eagerOrDelay([proto, val], () => {
        invariant(proto);
        let serialisedProto = this.serialiseValue(proto, reasons.concat(`Referred to as the prototype for ${name}`));
        let uid = this._getValIdForReference(val);
        if (this.realm.compatibility !== "jsc")
          this.body.push(t.expressionStatement(t.callExpression(
            this.preludeGenerator.memoiseReference("Object.setPrototypeOf"),
            [uid, serialisedProto]
          )));
        else {
          this.body.push(t.expressionStatement(t.assignmentExpression(
            "=",
            t.memberExpression(uid, t.identifier("__proto__")),
            serialisedProto
          )));
        }
      });
    }
  }

  _emitProperty(name: string, uid: BabelNodeIdentifier, key: BabelNodeIdentifier | BabelNodeStringLiteral, desc: Descriptor, ignoreEmbedded: boolean, reasons: Array<string>): void {
    if (this._canEmbedProperty(desc, true)) {
      let descValue = desc.value;
      invariant(descValue instanceof Value);
      if (ignoreEmbedded) return;

      this.body.push(t.expressionStatement(t.assignmentExpression(
        "=",
        t.memberExpression(uid, key, !t.isIdentifier(key)),
          this.serialiseValue(
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
            this.serialiseValue(
              descValue,
              reasons.concat(`Referred to in the object ${name} for the key ${((key: any): BabelNodeIdentifier).name || ((key: any): BabelNodeStringLiteral).value} in the descriptor property ${descKey}`)
            )
          )));
        }
      }

      let keyRaw = key;
      if (t.isIdentifier(keyRaw)) keyRaw = t.stringLiteral(((keyRaw: any): BabelNodeIdentifier).name);

      this.body.push(t.expressionStatement(t.callExpression(
        this.preludeGenerator.memoiseReference("Object.defineProperty"),
        [uid, keyRaw, descriptorId]
      )));
    }
  }

  _serialiseDeclarativeEnvironmentRecordBinding(r: DeclarativeEnvironmentRecord, n: string, functionName: string, reasons: Array<string>): SerialisedBinding {
    let serialisedBindings = this.declarativeEnvironmentRecordsBindings.get(r);
    if (!serialisedBindings) {
      serialisedBindings = Object.create(null);
      this.declarativeEnvironmentRecordsBindings.set(r, serialisedBindings);
    }
    let serialisedBinding: ?SerialisedBinding = serialisedBindings[n];
    if (!serialisedBinding) {
      let realm = this.realm;
      let binding = r.bindings[n];
      // TODO: handle binding.deletable, binding.mutable
      let value = (binding.initialized && binding.value) || realm.intrinsics.undefined;
      let serialisedValue = this.serialiseValue(
        value,
        reasons.concat(`access in ${functionName} to ${n}`));
      serialisedBinding = { serialisedValue, value };
      serialisedBindings[n] = serialisedBinding;
    }
    return serialisedBinding;
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

  serialiseValue(val: Value, reasons?: Array<string>, referenceOnly?: boolean, bindingType?: BabelVariableKind): BabelNodeExpression {

    let ref = this._getValIdForReferenceOptional(val);
    if (ref) {
      return ref;
    }

    reasons = reasons || [];
    if (!referenceOnly && this.shouldInline(val)) {
      let res = this._serialiseValue("", val, reasons);
      invariant(res !== undefined);
      return res;
    }

    let name = this.generateUid(val);
    let id = t.identifier(name);
    this.refs.set(val, id);
    this.serialisationStack.push(val);
    let init = this._serialiseValue(name, val, reasons);
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

    this.serialisationStack.pop();
    if (this.serialisationStack.length === 0) {
      while (this.delayedSerialisations.length) {
        invariant(this.serialisationStack.length === 0);
        let serialiser = this.delayedSerialisations.shift();
        serialiser();
      }
    }

    return result;
  }

  _serialiseValueIntrinsic(val: Value): BabelNodeExpression {
    invariant(val.intrinsicName);
    return this.preludeGenerator.convertStringToMember(val.intrinsicName);
  }

  _delay(reason: boolean | BabelNodeIdentifier, values: Array<Value>, func: () => void) {
    invariant(reason);
    if (reason === true) {
      this.delayedSerialisations.push(func);
    } else {
      let a = this.delayedKeyedSerialisations.get(reason);
      if (a === undefined) this.delayedKeyedSerialisations.set(reason, a = []);
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

    return this.serialisationStack.indexOf(val) >= 0;
  }

  _eagerOrDelay(values: Array<Value>, serialiser: () => void) {
    let delayReason = this._shouldDelayValues(values);
    if (delayReason) {
      this._delay(delayReason, values, serialiser);
    } else {
      serialiser();
    }
  }

  _serialiseValueArray(name: string, val: ObjectValue, reasons: Array<string>): BabelNodeExpression {
    let realm = this.realm;
    let elems = [];

    // TODO: this shouldn't trigger any user code
    let len = ToLength(realm, Get(realm, val, "length"));
    for (let i = 0; i < len; i++) {
      let key = i + "";
      let elem;
      if (HasProperty(realm, val, key)) {
        let elemVal = Get(realm, val, key);
        let delayReason = this._shouldDelayValue(elemVal);
        if (delayReason) {
          // handle self recursion
          this._delay(delayReason, [elemVal], () => {
            let id = this._getValIdForReference(val);
            this.body.push(t.expressionStatement(t.assignmentExpression(
              "=",
              t.memberExpression(id, t.numericLiteral(i), true),
              this.serialiseValue(
                elemVal,
                reasons.concat(`Declared in array ${name} at index ${key}`)
              )
            )));
          });
          elem = null;
        } else {
          elem = this.serialiseValue(
            elemVal,
            reasons.concat(`Declared in array ${name} at index ${key}`)
          );
        }
      } else {
        elem = null;
      }
      elems.push(elem);
    }

    this.addProperties(name, val, true, reasons);
    return t.arrayExpression(elems);
  }

  _serialiseValueFunction(name: string, val: FunctionValue, reasons: Array<string>): void | BabelNodeExpression {
    if (val instanceof BoundFunctionValue) {
      return t.callExpression(
        t.memberExpression(
          this.serialiseValue(val.$BoundTargetFunction, reasons.concat(`Bound by ${name}`)),
          t.identifier("bind")
        ),
        [].concat(
          this.serialiseValue(val.$BoundThis, reasons.concat(`Bound this of ${name}`)),
          val.$BoundArguments.map((boundArg, i) => this.serialiseValue(boundArg, reasons.concat(`Bound argument ${i} of ${name}`)))
        )
      );
    }

    if (val instanceof NativeFunctionValue) {
      throw new Error("TODO: do not know how to serialise non-intrinsic native function value");
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

      let state = { serialiser: this, val, reasons, name, functionInfo,
        map: functionInfo.names, realm: this.realm,
        requiredModules: this.requiredModules,
        isRequire: this._getIsRequire(val.$FormalParameters, [val]) };

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
        closureRefVisitor,
        null,
        state
      );

      if (val.isResidual && Object.keys(functionInfo.names).length) {
        this.logError(`residual function ${describeLocation(this.realm, val, undefined, val.$ECMAScriptCode.loc) || "(unknown)"} refers to the following identifiers defined outside of the local scope: ${Object.keys(functionInfo.names).join(", ")}`);
      }
    }



    let serialisedBindings = Object.create(null);
    let instance = {
      serialisedBindings,
      functionValue: val,
      bodyIndex: -1
    };
    let delayed = 0;
    for (let innerName in functionInfo.names) {
      let referencedValues = [];
      let serialiseBindingFunc;
      let doesNotMatter = true;
      let reference = this.tryQuery(
        () => ResolveBinding(this.realm, innerName, doesNotMatter, val.$Environment),
        undefined, true);
      if (reference === undefined) {
        serialiseBindingFunc = () => this._serialiseGlobalBinding(innerName);
      } else {
        invariant(!IsUnresolvableReference(this.realm, reference));
        let referencedBase = reference.base;
        let referencedName: string = (reference.referencedName: any);
        if (typeof referencedName !== "string") {
          throw new Error("TODO: do not know how to serialise reference with symbol");
        }
        if (reference.base instanceof GlobalEnvironmentRecord) {
          serialiseBindingFunc = () => this._serialiseGlobalBinding(referencedName);
        } else if (referencedBase instanceof DeclarativeEnvironmentRecord) {
          serialiseBindingFunc = () => {
            invariant(referencedBase instanceof DeclarativeEnvironmentRecord);
            return this._serialiseDeclarativeEnvironmentRecordBinding(referencedBase, referencedName, name, reasons);
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
          let serialisedBinding = serialiseBindingFunc();
          invariant(serialisedBinding);
          serialisedBindings[innerName] = serialisedBinding;
          invariant(functionInfo);
          if (functionInfo.modified[innerName]) serialisedBinding.modified = true;
          if (--delayed === 0) {
            instance.bodyIndex = this.body.length;
            this.functionInstances.push(instance);
          }
        });
      } else {
        let serialisedBinding = serialiseBindingFunc();
        invariant(serialisedBinding);
        serialisedBindings[innerName] = serialisedBinding;
        invariant(functionInfo);
        if (functionInfo.modified[innerName]) serialisedBinding.modified = true;
      }
    }

    if (delayed === 0) {
      instance.bodyIndex = this.body.length;
      this.functionInstances.push(instance);
    }
    functionInfo.instances.push(instance);

    this.addProperties(name, val, false, reasons);
  }

  _canEmbedProperty(prop: Descriptor, configurable: boolean = true): boolean {
    return !!prop.writable && !!prop.configurable === configurable && !!prop.enumerable && !prop.set && !prop.get;
  }

  _serialiseValueObject(name: string, val: ObjectValue, reasons: Array<string>): BabelNodeExpression {
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
              this.serialiseValue(
                propValue,
                reasons.concat(`Referenced in object ${name} with key ${key}`)
              )
            )));
          });
        } else {
          props.push(t.objectProperty(keyNode, this.serialiseValue(
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

  _serialiseValueSymbol(val: SymbolValue): BabelNodeExpression {
    let args = [];
    if (val.$Description) args.push(t.stringLiteral(val.$Description));
    return t.callExpression(t.identifier("Symbol"), args);
  }

  _serialiseValueProxy(name: string, val: ProxyValue, reasons: Array<string>): BabelNodeExpression {
    return t.newExpression(t.identifier("Proxy"), [
      this.serialiseValue(val.$ProxyTarget, reasons.concat(`Proxy target of ${name}`)),
      this.serialiseValue(val.$ProxyHandler, reasons.concat(`Proxy handler of ${name}`))
    ]);
  }

  _serialiseAbstractValue(name: string, val: AbstractValue, reasons: Array<string>): BabelNodeExpression {
    let serialisedArgs = val.args.map((abstractArg, i) => this.serialiseValue(abstractArg, reasons.concat(`Argument ${i} of ${name}`)));
    let serialisedValue = val.buildNode(serialisedArgs);
    if (serialisedValue.type === "Identifier") {
      let id = ((serialisedValue: any): BabelNodeIdentifier);
      invariant(!this.preludeGenerator.derivedIds.has(id) ||
        this.declaredDerivedIds.has(id));
    }
    return serialisedValue;
  }

  _serialiseValue(name: string, val: Value, reasons: Array<string>): void | BabelNodeExpression {
    if (val instanceof AbstractValue) {
      return this._serialiseAbstractValue(name, val, reasons);
    } else if (val.isIntrinsic()) {
      return this._serialiseValueIntrinsic(val);
    } else if (val instanceof EmptyValue) {
      this.needsEmptyVar = true;
      return t.identifier("__empty");
    } else if (this.shouldInline(val)) {
      return t.valueToNode(val.serialise());
    } else if (IsArray(this.realm, val)) {
      invariant(val instanceof ObjectValue);
      return this._serialiseValueArray(name, val, reasons);
    } else if (val instanceof ProxyValue) {
      return this._serialiseValueProxy(name, val, reasons);
    } else if (val instanceof FunctionValue) {
      return this._serialiseValueFunction(name, val, reasons);
    } else if (val instanceof SymbolValue) {
      return this._serialiseValueSymbol(val);
    } else if (val instanceof ObjectValue) {
      return this._serialiseValueObject(name, val, reasons);
    } else {
      invariant(false);
    }
  }

  _serialiseGlobalBinding(key: string): void | SerialisedBinding {
    if (t.isValidIdentifier(key)) {
      let value = this.realm.getGlobalLetBinding(key);
      // Check for let binding vs global property
      if (value) {
        let id = this.serialiseValue(value, ["global let binding"], true, "let");
        // increment ref count one more time as the value has been
        // referentialised (stored in a variable) by serialiseValue
        this._incrementValToRefCount(value);
        return {
          serialisedValue: id,
          modified: true, referentialised: true
        };
      } else {
        return { serialisedValue: t.identifier(key), modified: true, referentialised: true };
      }
    } else {
      return { serialisedValue: t.stringLiteral(key), modified: true, referentialised: true };
    }
  }

  _initialiseMoreModules() {
    // partially evaluate all factory methods by calling require
    let realm = this.realm;
    let anyHeapChanges = false;
    // setup execution environment
    let context = new ExecutionContext();
    let env = realm.$GlobalEnv;
    context.lexicalEnvironment = env;
    context.variableEnvironment = env;
    context.realm = realm;
    realm.contextStack.push(context);
    let count = 0;
    let introspectionErrors = Object.create(null);
    for (let moduleId of this.requiredModules) {
      if (this.requireReturns.has(moduleId)) continue; // already known to be initialized
      let node = t.callExpression(t.identifier("require"), [t.valueToNode(moduleId)]);

      let [compl, gen, bindings, properties, createdObjects] =
        realm.partially_evaluate(node, true, env, false);

      if (compl instanceof Completion) {
        if (IsIntrospectionErrorCompletion(realm, compl)) {
          let value = compl.value;
          invariant(value instanceof ObjectValue);
          realm.restoreBindings(bindings);
          realm.restoreProperties(properties);
          let message = ToStringPartial(realm, Get(realm, value, "message"));
          realm.restoreBindings(bindings);
          realm.restoreProperties(properties);
          let moduleIds = introspectionErrors[message] = introspectionErrors[message] || [];
          moduleIds.push(moduleId);
          continue;
        }

        console.log(`=== UNEXPECTED ERROR during speculative initialization of module ${moduleId} ===`);
        realm.restoreBindings(bindings);
        realm.restoreProperties(properties);
        this.logCompletion(compl);
        break;
      }

      invariant(compl instanceof Value);

      // Apply the joined effects to the global state
      anyHeapChanges = true;
      realm.restoreBindings(bindings);
      realm.restoreProperties(properties);

      // Add generated code for property modifications
      let realmGenerator = this.realm.generator;
      invariant(realmGenerator);
      let first = true;
      for (let bodyEntry of gen.body) {
        let id = bodyEntry.declaresDerivedId;
        let originalBuildNode = bodyEntry.buildNode;
        let buildNode = originalBuildNode;
        if (first) {
          first = false;
          buildNode = (nodes, f) => {
            let n = originalBuildNode(nodes, f);
            n.leadingComments = [({ type: "BlockComment", value: `Speculative initialization of module ${moduleId}` }: any)];
            return n;
          };
        }
        realmGenerator.body.push({ declaresDerivedId: id, args: bodyEntry.args, buildNode: buildNode });
        if (id !== undefined) {
          this.declaredDerivedIds.add(id);
        }
      }

      this.requireReturns.set(moduleId, this.serialiseValue(compl));

      // Ignore created objects
      createdObjects;
      count++;
    }
    if (count > 0) console.log(`=== speculatively initialized ${count} additional modules`);
    if (count === 0) {
      if (!this.collectValToRefCountOnly) {
        let a = [];
        for (let key in introspectionErrors) a.push([introspectionErrors[key], key]);
        a.sort((x, y) => y[0].length - x[0].length);
        if (a.length) {
          console.log(`=== speculative module initialization failures ordered by frequency`);
          for (let [moduleIds, n] of a) console.log(`${moduleIds.length}x ${n} [${moduleIds.join(",")}]`);
        }
      }
    }
    realm.contextStack.pop();
    return anyHeapChanges;
  }

  _resolveRequireReturns() {
    // partial evaluate all possible requires and see which are possible to inline
    let realm = this.realm;
    this.requireReturns = new Map();
    // setup execution environment
    let context = new ExecutionContext();
    let env = realm.$GlobalEnv;
    context.lexicalEnvironment = env;
    context.variableEnvironment = env;
    context.realm = realm;
    realm.contextStack.push(context);
    let oldReadOnly = realm.setReadOnly(true);

    for (let moduleId of this.requiredModules) {
      let node = t.callExpression(t.identifier("require"), [t.valueToNode(moduleId)]);

      let [compl, gen, bindings, properties, createdObjects] =
        realm.partially_evaluate(node, true, env, false);
      // for lint unused
      invariant(bindings);

      if (compl instanceof AbruptCompletion) continue;
      invariant(compl instanceof Value);

      if (gen.body.length !== 0 ||
        (compl instanceof ObjectValue && createdObjects.has(compl))) continue;
      // Check for escaping property assignments, if none escape, we're safe
      // to replace the require with its exports object
      let escapes = false;
      for (let [binding] of properties) {
        if (!createdObjects.has(binding.object)) escapes = true;
      }
      if (escapes) continue;

      this.requireReturns.set(moduleId, this.serialiseValue(compl));
    }
    realm.contextStack.pop();
    realm.setReadOnly(oldReadOnly);
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
        let serialisedBindings = instance.serialisedBindings;
        for (let name in names) {
          let serialisedBinding: SerialisedBinding = serialisedBindings[name];
          if (serialisedBinding.modified && !serialisedBinding.referentialised) {
            let serialisedBindingId = t.identifier(this.generateUid());
            let declar = t.variableDeclaration("var", [
              t.variableDeclarator(serialisedBindingId, serialisedBinding.serialisedValue)]);
            getFunctionBody(instance).push(declar);
            serialisedBinding.serialisedValue = serialisedBindingId;
            serialisedBinding.referentialised = true;
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
      let anySerialisedBindingModified = false;
      for (let instance of instances) {
        let serialisedBindings = instance.serialisedBindings;
        for (let name in names) {
          let serialisedBinding: SerialisedBinding = serialisedBindings[name];
          if (serialisedBinding.modified) {
            anySerialisedBindingModified = true;
          }
        }
      }

      if (shouldInline || instances.length === 1 || usesArguments || anySerialisedBindingModified) {
        for (let instance of instances) {
          let { functionValue, serialisedBindings } = instance;
          let id = this._getValIdForReference(functionValue);
          let funcParams = params.slice();
          let funcNode = t.functionDeclaration(id, funcParams, ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement));

          traverse(
            t.file(t.program([funcNode])),
            closureRefReplacer,
            null,
            { serialisedBindings,
              modified,
              requireReturns: this.requireReturns,
              requireStatistics,
              isRequire: this._getIsRequire(funcParams, [functionValue]) }
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
        let sameSerialisedBindings = Object.create(null);
        for (let name in names) {
          let isDifferent = false;
          let lastBinding;

          for (let { serialisedBindings } of instances) {
            let serialisedBinding = serialisedBindings[name];
            invariant(!serialisedBinding.modified);
            if (!lastBinding) {
              lastBinding = serialisedBinding;
            } else if (!AreSameSerialisedBindings(serialisedBinding, lastBinding)) {
              isDifferent = true;
              break;
            }
          }

          if (isDifferent) {
            factoryNames.push(name);
          } else {
            invariant(lastBinding);
            sameSerialisedBindings[name] = { serialisedValue: lastBinding.serialisedValue };
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
          closureRefReplacer,
          null,
          { serialisedBindings: sameSerialisedBindings,
            modified,
            requireReturns: this.requireReturns,
            requireStatistics,
            isRequire: this._getIsRequire(factoryParams, instances.map(instance => instance.functionValue)) }
        );

        //

        for (let instance of instances) {
          let { functionValue, serialisedBindings } = instance;
          let id = this._getValIdForReference(functionValue);
          let flatArgs: Array<BabelNodeExpression> = factoryNames.map((name) => serialisedBindings[name].serialisedValue);
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
      invariant(instance.bodyIndex >= 0);
      Array.prototype.splice.apply(this.body, ([instance.bodyIndex, 0]: Array<any>).concat((functionBody: Array<any>)));
    }

    if (requireStatistics.replaced > 0 && !this.collectValToRefCountOnly) {
      console.log(`=== ${this.requireReturns.size} of ${this.requiredModules.size} modules initialized, ${requireStatistics.replaced} of ${requireStatistics.count} require calls inlined.`);
    }
  }

  _emitGenerator(generator: Generator) {
    let reasons = ["Abstract mutation"];
    let serializeValue = this.serialiseValue.bind(this);
    for (let bodyEntry of generator.body) {
      let nodes = bodyEntry.args.map((boundArg, i) => this.serialiseValue(boundArg, reasons));
      this.body.push(bodyEntry.buildNode(nodes, serializeValue));
      let id = bodyEntry.declaresDerivedId;
      if (id !== undefined) {
        this.declaredDerivedIds.add(id);
        let a = this.delayedKeyedSerialisations.get(id);
        if (a !== undefined) {
          while (a.length) {
            invariant(this.serialisationStack.length === 0);
            invariant(this.delayedSerialisations.length === 0);
            let { values, func } = a.shift();
            this._eagerOrDelay(values, func);
          }
          this.delayedKeyedSerialisations.delete(id);
        }
      }
    }
    invariant(this.delayedKeyedSerialisations.size === 0);
  }

  serialise(filename: string, code: string, sourceMaps: boolean): { anyHeapChanges?: boolean, generated?: { code: string, map?: string } } {
    let realm = this.realm;

    this.require = Get(realm, realm.$GlobalObject, "require");

    this._emitGenerator(this.generator);
    invariant(this.declaredDerivedIds.size <= this.preludeGenerator.derivedIds.size);

    Array.prototype.push.apply(this.prelude, this.preludeGenerator.prelude);

    // TODO serialise symbols
    // for (let symbol of globalObj.symbols.keys());

    // TODO add timers

    // TODO add event listeners

    this._resolveRequireReturns();
    if (this.initialiseMoreModules) {
      // Note: This may mutate heap state, and render
      if (this._initialiseMoreModules()) return { anyHeapChanges: true };
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
    if (this._hasErrors) return undefined;
    let anyHeapChanges = true;
    this.collectValToRefCountOnly = true;
    while (anyHeapChanges) {
      this.valToRefCount = new Map();
      anyHeapChanges = !!this.serialise(filename, code, sourceMaps).anyHeapChanges;
      if (this._hasErrors) return undefined;
      this._resetSerializeStates();
    }
    this.collectValToRefCountOnly = false;
    let serialised = this.serialise(filename, code, sourceMaps);
    invariant(!serialised.anyHeapChanges);
    invariant(!this._hasErrors);
    return serialised.generated;
  }
}
