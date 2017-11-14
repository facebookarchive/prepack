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
import type { Descriptor, PropertyBinding } from "../types.js";
import { ToLength, IsArray, Get, IsAccessorDescriptor } from "../methods/index.js";
import {
  ArrayValue,
  BoundFunctionValue,
  ProxyValue,
  SymbolValue,
  NumberValue,
  StringValue,
  BooleanValue,
  AbstractValue,
  EmptyValue,
  FunctionValue,
  ECMAScriptSourceFunctionValue,
  Value,
  ObjectValue,
  NativeFunctionValue,
  UndefinedValue,
} from "../values/index.js";
import { convertExpressionToJSXIdentifier, convertKeyValueToJSXAttribute } from "../react/jsx.js";
import { isReactElement } from "../react/utils.js";
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
import type {
  ResidualFunctionBinding,
  FunctionInfo,
  FunctionInstance,
  AdditionalFunctionInfo,
  ReactSerializerState,
  SerializedBody,
} from "./types.js";
import type { SerializerOptions } from "../options.js";
import { TimingStatistics, SerializerStatistics } from "./types.js";
import { Logger } from "./logger.js";
import { Modules } from "./modules.js";
import { ResidualHeapInspector } from "./ResidualHeapInspector.js";
import { ResidualFunctions } from "./ResidualFunctions.js";
import type { Scope } from "./ResidualHeapVisitor.js";
import { factorifyObjects } from "./factorify.js";
import { voidExpression, emptyExpression, constructorExpression, protoExpression } from "../utils/internalizer.js";
import { Emitter } from "./Emitter.js";
import { ResidualHeapValueIdentifiers } from "./ResidualHeapValueIdentifiers.js";
import { commonAncestorOf, getSuggestedArrayLiteralLength } from "./utils.js";
import type { Effects } from "../realm.js";

export class ResidualHeapSerializer {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    residualHeapValueIdentifiers: ResidualHeapValueIdentifiers,
    residualHeapInspector: ResidualHeapInspector,
    residualValues: Map<Value, Set<Scope>>,
    residualFunctionInstances: Map<FunctionValue, FunctionInstance>,
    residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>,
    options: SerializerOptions,
    referencedDeclaredValues: Set<AbstractValue>,
    additionalFunctionValuesAndEffects: Map<FunctionValue, Effects> | void,
    additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>,
    statistics: SerializerStatistics,
    react: ReactSerializerState
  ) {
    this.realm = realm;
    this.logger = logger;
    this.modules = modules;
    this.residualHeapValueIdentifiers = residualHeapValueIdentifiers;
    this.statistics = statistics;
    this.react = react;

    let realmGenerator = this.realm.generator;
    invariant(realmGenerator);
    this.generator = realmGenerator;
    let realmPreludeGenerator = this.realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;

    this.prelude = [];
    this._descriptors = new Map();
    this.needsEmptyVar = false;
    this.needsAuxiliaryConstructor = false;
    this.valueNameGenerator = this.preludeGenerator.createNameGenerator("_");
    this.descriptorNameGenerator = this.preludeGenerator.createNameGenerator("$$");
    this.factoryNameGenerator = this.preludeGenerator.createNameGenerator("$_");
    this.intrinsicNameGenerator = this.preludeGenerator.createNameGenerator("$i_");
    this.requireReturns = new Map();
    this.serializedValues = new Set();
    this.additionalFunctionValueNestedFunctions = new Set();
    this.residualFunctions = new ResidualFunctions(
      this.realm,
      this.statistics,
      this.modules,
      this.requireReturns,
      {
        getLocation: value => this.getSerializeObjectIdentifierOptional(value),
        createLocation: () => {
          let location = t.identifier(this.valueNameGenerator.generate("initialized"));
          this.currentFunctionBody.entries.push(t.variableDeclaration("var", [t.variableDeclarator(location)]));
          return location;
        },
      },
      this.prelude,
      this.preludeGenerator.createNameGenerator("__init_"),
      this.factoryNameGenerator,
      this.preludeGenerator.createNameGenerator("__scope_"),
      residualFunctionInfos,
      residualFunctionInstances,
      additionalFunctionValueInfos,
      this.additionalFunctionValueNestedFunctions
    );
    this.emitter = new Emitter(this.residualFunctions);
    this.mainBody = this.emitter.getBody();
    this.currentFunctionBody = this.mainBody;
    this.residualHeapInspector = residualHeapInspector;
    this.residualValues = residualValues;
    this.residualFunctionInstances = residualFunctionInstances;
    this.residualFunctionInfos = residualFunctionInfos;
    this._options = options;
    this.referencedDeclaredValues = referencedDeclaredValues;
    this.activeGeneratorBodies = new Map();
    this.additionalFunctionValuesAndEffects = additionalFunctionValuesAndEffects;
    this.additionalFunctionValueInfos = additionalFunctionValueInfos;
  }

  emitter: Emitter;
  functions: Map<BabelNodeBlockStatement, Array<FunctionInstance>>;
  functionInstances: Array<FunctionInstance>;
  prelude: Array<BabelNodeStatement>;
  body: Array<BabelNodeStatement>;
  mainBody: SerializedBody;
  // if we're in an additional function we need to access both mainBody and the
  // additional function's body which will be currentFunctionBody.
  currentFunctionBody: SerializedBody;
  realm: Realm;
  preludeGenerator: PreludeGenerator;
  generator: Generator;
  _descriptors: Map<string, BabelNodeIdentifier>;
  needsEmptyVar: boolean;
  needsAuxiliaryConstructor: boolean;
  valueNameGenerator: NameGenerator;
  descriptorNameGenerator: NameGenerator;
  factoryNameGenerator: NameGenerator;
  intrinsicNameGenerator: NameGenerator;
  logger: Logger;
  modules: Modules;
  residualHeapValueIdentifiers: ResidualHeapValueIdentifiers;
  requireReturns: Map<number | string, BabelNodeExpression>;
  statistics: SerializerStatistics;
  timingStats: TimingStatistics;
  residualHeapInspector: ResidualHeapInspector;
  residualValues: Map<Value, Set<Scope>>;
  residualFunctionInstances: Map<FunctionValue, FunctionInstance>;
  residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  serializedValues: Set<Value>;
  residualFunctions: ResidualFunctions;
  _options: SerializerOptions;
  referencedDeclaredValues: Set<AbstractValue>;
  activeGeneratorBodies: Map<Generator, SerializedBody>;
  additionalFunctionValuesAndEffects: Map<FunctionValue, Effects> | void;
  additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>;
  react: ReactSerializerState;

  // function values nested in additional functions can't delay initializations
  // TODO: revisit this and fix additional functions to be capable of delaying initializations
  additionalFunctionValueNestedFunctions: Set<FunctionValue>;
  currentAdditionalFunction: void | FunctionValue;

  // Configures all mutable aspects of an object, in particular:
  // symbols, properties, prototype.
  // For every created object that corresponds to a value,
  // this function should be invoked once.
  // Thus, as a side effects, we gather statistics here on all emitted objects.
  _emitObjectProperties(
    obj: ObjectValue,
    properties: Map<string, PropertyBinding> = obj.properties,
    objectPrototypeAlreadyEstablished: boolean = false,
    cleanupDummyProperties: ?Set<string>
  ) {
    //inject symbols
    for (let [symbol, propertyBinding] of obj.symbols) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      this.emitter.emitNowOrAfterWaitingForDependencies(this._getDescriptorValues(desc).concat([symbol, obj]), () => {
        invariant(desc !== undefined);
        return this._emitProperty(obj, symbol, desc);
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
        return this._emitProperty(obj, key, desc, cleanupDummyProperties != null && cleanupDummyProperties.has(key));
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
        let uid = this.getSerializeObjectIdentifier(obj);
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
      let uid = this.getSerializeObjectIdentifier(obj);
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
        invariant(prototype instanceof Value);
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
      let uid = this.getSerializeObjectIdentifier(obj);
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
      let oldBody = this.emitter.beginEmitting("consequent", { type: "ConditionalAssignmentBranch", entries: [] });
      this._emitPropertiesWithComputedNames(obj, consequent);
      let consequentBody = this.emitter.endEmitting("consequent", oldBody);
      let consequentStatement = t.blockStatement(consequentBody.entries);
      oldBody = this.emitter.beginEmitting("alternate", { type: "ConditionalAssignmentBranch", entries: [] });
      this._emitPropertiesWithComputedNames(obj, alternate);
      let alternateBody = this.emitter.endEmitting("alternate", oldBody);
      let alternateStatement = t.blockStatement(alternateBody.entries);
      this.emitter.emit(t.ifStatement(serializedCond, consequentStatement, alternateStatement));
    }
  }

  // Overridable.
  getSerializeObjectIdentifier(val: Value) {
    return this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(val);
  }

  // Overridable.
  getSerializeObjectIdentifierOptional(val: Value) {
    return this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCountOptional(val);
  }

  _emitProperty(
    val: ObjectValue,
    key: string | SymbolValue,
    desc: Descriptor | void,
    deleteIfMightHaveBeenDeleted: boolean = false
  ): void {
    // Location for the property to be assigned to
    let locationFunction = () => {
      let serializedKey =
        key instanceof SymbolValue ? this.serializeValue(key) : this.generator.getAsPropertyNameExpression(key);
      let computed = key instanceof SymbolValue || !t.isIdentifier(serializedKey);
      return t.memberExpression(this.getSerializeObjectIdentifier(val), serializedKey, computed);
    };
    if (desc === undefined) {
      this._deleteProperty(locationFunction());
    } else if (this._canEmbedProperty(val, key, desc)) {
      let descValue = desc.value;
      invariant(descValue instanceof Value);
      invariant(!this.emitter.getReasonToWaitForDependencies([descValue, val]), "precondition of _emitProperty");
      let mightHaveBeenDeleted = descValue.mightHaveBeenDeleted();
      // The only case we do not need to remove the dummy property is array index property.
      this._assignProperty(
        locationFunction,
        () => {
          invariant(descValue instanceof Value);
          return this.serializeValue(descValue);
        },
        mightHaveBeenDeleted,
        deleteIfMightHaveBeenDeleted
      );
    } else {
      this.emitter.emit(this.emitDefinePropertyBody(val, key, desc));
    }
  }

  emitDefinePropertyBody(val: ObjectValue, key: string | SymbolValue, desc: Descriptor): BabelNodeStatement {
    let body = [];
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

    descriptorsKey = descriptorsKey.join(",");
    let descriptorId = this._descriptors.get(descriptorsKey);
    if (descriptorId === undefined) {
      descriptorId = t.identifier(this.descriptorNameGenerator.generate(descriptorsKey));
      let declar = t.variableDeclaration("var", [t.variableDeclarator(descriptorId, t.objectExpression(descProps))]);
      // The descriptors are used across all scopes, and thus must be declared in the prelude.
      this.prelude.push(declar);
      this._descriptors.set(descriptorsKey, descriptorId);
    }
    invariant(descriptorId !== undefined);

    for (let descKey of valKeys) {
      if (descKey in desc) {
        let descValue = desc[descKey];
        invariant(descValue instanceof Value);
        invariant(!this.emitter.getReasonToWaitForDependencies([descValue]), "precondition of _emitProperty");
        body.push(
          t.assignmentExpression(
            "=",
            t.memberExpression(descriptorId, t.identifier(descKey)),
            this.serializeValue(descValue)
          )
        );
      }
    }
    let serializedKey =
      key instanceof SymbolValue
        ? this.serializeValue(key)
        : this.generator.getAsPropertyNameExpression(key, /*canBeIdentifier*/ false);
    invariant(!this.emitter.getReasonToWaitForDependencies([val]), "precondition of _emitProperty");
    body.push(
      t.callExpression(this.preludeGenerator.memoizeReference("Object.defineProperty"), [
        this.getSerializeObjectIdentifier(val),
        serializedKey,
        descriptorId,
      ])
    );
    return t.expressionStatement(t.sequenceExpression(body));
  }

  _serializeDeclarativeEnvironmentRecordBinding(residualFunctionBinding: ResidualFunctionBinding) {
    if (!residualFunctionBinding.serializedValue) {
      let value = residualFunctionBinding.value;
      invariant(value);
      invariant(residualFunctionBinding.declarativeEnvironmentRecord);

      // Set up binding identity before starting to serialize value. This is needed in case of recursive dependencies.
      residualFunctionBinding.referentialized = false;
      residualFunctionBinding.serializedValue = this.serializeValue(value);
      if (value.mightBeObject()) {
        // Increment ref count one more time to ensure that this object will be assigned a unique id.
        // This ensures that only once instance is created across all possible residual function invocations.
        this.residualHeapValueIdentifiers.incrementReferenceCount(value);
      }
    }
  }

  // Determine whether initialization code for a value should go into the main body, or a more specific initialization body.
  _getTarget(
    val: Value,
    scopes: Set<Scope>
  ): { body: SerializedBody, usedOnlyByResidualFunctions?: true, usedOnlyByAdditionalFunctions?: boolean } {
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
          return { body: this.currentFunctionBody };
        }
        generators.push(scope);
      }
    }

    if (generators.length === 0) {
      // This value is only referenced from residual functions.
      invariant(functionValues.length > 0);
      let additionalFunctionValuesAndEffects = this.additionalFunctionValuesAndEffects;
      let numAdditionalFunctionReferences = 0;
      // Make sure we don't delay things referenced by additional functions or nested functions
      if (additionalFunctionValuesAndEffects) {
        // flow forces me to do this
        let additionalFuncValuesAndEffects = additionalFunctionValuesAndEffects;
        numAdditionalFunctionReferences = functionValues.filter(
          funcValue =>
            additionalFuncValuesAndEffects.has(funcValue) || this.additionalFunctionValueNestedFunctions.has(funcValue)
        ).length;
      }

      if (numAdditionalFunctionReferences > 0 || !this._options.delayInitializations) {
        // We can just emit it into the current function body.
        return {
          body: this.currentFunctionBody,
          usedOnlyByAdditionalFunctions: numAdditionalFunctionReferences === functionValues.length,
        };
      } else {
        // We can delay the initialization, and move it into a conditional code block in the residual functions!
        let body = this.residualFunctions.residualFunctionInitializers.registerValueOnlyReferencedByResidualFunctions(
          functionValues,
          val
        );
        return { body, usedOnlyByResidualFunctions: true };
      }
    }

    // This value is referenced from more than one generator or function.
    // We can emit the initialization of this value into the body associated with their common ancestor.
    let commonAncestor = Array.from(scopes).reduce((x, y) => commonAncestorOf(x, y), generators[0]);
    invariant(commonAncestor instanceof Generator); // every scope is either the root, or a descendant
    let body;
    while (true) {
      if (commonAncestor === this.generator) {
        body = this.currentFunctionBody;
      } else {
        body = this.activeGeneratorBodies.get(commonAncestor);
      }
      if (body !== undefined) break;
      commonAncestor = commonAncestor.parent;
      invariant(commonAncestor !== undefined);
    }
    invariant(body !== undefined);
    return { body };
  }

  serializeValue(val: Value, referenceOnly?: boolean, bindingType?: BabelVariableKind): BabelNodeExpression {
    invariant(!val.refuseSerialization);
    let scopes = this.residualValues.get(val);
    invariant(scopes !== undefined);

    let ref = this.getSerializeObjectIdentifierOptional(val);
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
            this.mainBody.entries.push(declar);
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
    let intrinsicName = val.intrinsicName;
    invariant(intrinsicName);
    if (val instanceof ObjectValue && val.intrinsicNameGenerated) {
      // The intrinsic was generated at a particular point in time.
      return this.preludeGenerator.convertStringToMember(intrinsicName);
    } else {
      // The intrinsic conceptually exists ahead of time.
      invariant(this.emitter.getBody() === this.currentFunctionBody);
      return this.preludeGenerator.memoizeReference(intrinsicName);
    }
  }

  _getDescriptorValues(desc: Descriptor): Array<Value> {
    invariant(desc.value === undefined || desc.value instanceof Value);
    if (desc.value !== undefined) return [desc.value];
    invariant(desc.get !== undefined);
    invariant(desc.set !== undefined);
    return [desc.get, desc.set];
  }

  _deleteProperty(location: BabelNodeLVal) {
    invariant(location.type === "MemberExpression");
    this.emitter.emit(
      t.expressionStatement(t.unaryExpression("delete", ((location: any): BabelNodeMemberExpression), true))
    );
  }

  _assignProperty(
    locationFn: () => BabelNodeLVal,
    valueFn: () => BabelNodeExpression,
    mightHaveBeenDeleted: boolean,
    deleteIfMightHaveBeenDeleted: boolean = false
  ) {
    let location = locationFn();
    let value = valueFn();
    let assignment = t.expressionStatement(t.assignmentExpression("=", location, value));
    if (mightHaveBeenDeleted) {
      let condition = t.binaryExpression("!==", value, this.serializeValue(this.realm.intrinsics.empty));
      let deletion = null;
      if (deleteIfMightHaveBeenDeleted) {
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

  _serializeArrayIndexProperties(
    array: ObjectValue,
    indexPropertyLength: number,
    remainingProperties: Map<string, PropertyBinding>
  ) {
    let elems = [];
    for (let i = 0; i < indexPropertyLength; i++) {
      let key = i + "";
      let propertyBinding = remainingProperties.get(key);
      let elem = null;
      // "propertyBinding === undefined" means array has a hole in the middle.
      if (propertyBinding !== undefined) {
        let descriptor = propertyBinding.descriptor;
        // "descriptor === undefined" means this array item has been deleted.
        if (
          descriptor !== undefined &&
          descriptor.value !== undefined &&
          this._canEmbedProperty(array, key, descriptor)
        ) {
          let elemVal = descriptor.value;
          invariant(elemVal instanceof Value);
          let mightHaveBeenDeleted = elemVal.mightHaveBeenDeleted();
          let delayReason =
            this.emitter.getReasonToWaitForDependencies(elemVal) ||
            this.emitter.getReasonToWaitForActiveValue(array, mightHaveBeenDeleted);
          if (!delayReason) {
            elem = this.serializeValue(elemVal);
            remainingProperties.delete(key);
          }
        }
      }
      elems.push(elem);
    }
    return elems;
  }

  _serializeArrayLengthIfNeeded(
    val: ObjectValue,
    numberOfIndexProperties: number,
    remainingProperties: Map<string, PropertyBinding>
  ): void {
    const realm = this.realm;
    let lenProperty = Get(realm, val, "length");
    // Need to serialize length property if:
    // 1. array length is abstract.
    // 2. array length is concrete, but different from number of index properties
    //  we put into initialization list.
    if (lenProperty instanceof AbstractValue || ToLength(realm, lenProperty) !== numberOfIndexProperties) {
      this.emitter.emitNowOrAfterWaitingForDependencies([val], () => {
        this._assignProperty(
          () => t.memberExpression(this.getSerializeObjectIdentifier(val), t.identifier("length")),
          () => {
            return this.serializeValue(lenProperty);
          },
          false /*mightHaveBeenDeleted*/
        );
      });
      remainingProperties.delete("length");
    }
  }

  _serializeValueArray(val: ObjectValue): BabelNodeExpression {
    let remainingProperties = new Map(val.properties);

    const indexPropertyLength = getSuggestedArrayLiteralLength(this.realm, val);
    // Use the serialized index properties as array initialization list.
    const initProperties = this._serializeArrayIndexProperties(val, indexPropertyLength, remainingProperties);
    this._serializeArrayLengthIfNeeded(val, indexPropertyLength, remainingProperties);
    this._emitObjectProperties(val, remainingProperties);
    return t.arrayExpression(initProperties);
  }

  _serializeValueReactElementChild(child: Value): BabelNode {
    if (isReactElement(child)) {
      // if we know it's a ReactElement, we add the value to the serializedValues
      // and short cut to get back the JSX expression so we don't emit additional data
      // we do this to ensure child JSXElements can get keys assigned if needed
      this.serializedValues.add(child);
      let reactChild = this._serializeValueObject(((child: any): ObjectValue));
      if (reactChild.leadingComments != null) {
        return t.jSXExpressionContainer(reactChild);
      }
      return reactChild;
    }
    const expr = this.serializeValue(child);

    if (t.isStringLiteral(expr) || t.isNumericLiteral(expr)) {
      return t.jSXText(((expr: any).value: string) + "");
    } else if (t.isJSXElement(expr)) {
      return expr;
    }
    return t.jSXExpressionContainer(expr);
  }

  _serializeValueReactElement(val: ObjectValue): BabelNodeExpression {
    let typeValue = Get(this.realm, val, "type");
    let keyValue = Get(this.realm, val, "key");
    let refValue = Get(this.realm, val, "ref");
    let propsValue = Get(this.realm, val, "props");

    invariant(typeValue !== null, "JSXElement type of null");

    let identifier = convertExpressionToJSXIdentifier(this.serializeValue(typeValue), true);
    let attributes = [];
    let children = [];

    if (keyValue !== null) {
      let keyExpr = this.serializeValue(keyValue);
      if (keyExpr.type !== "NullLiteral") {
        attributes.push(convertKeyValueToJSXAttribute("key", keyExpr));
      }
    }

    if (refValue !== null) {
      let refExpr = this.serializeValue(refValue);
      if (refExpr.type !== "NullLiteral") {
        attributes.push(convertKeyValueToJSXAttribute("ref", refExpr));
      }
    }

    if (propsValue instanceof ObjectValue) {
      // the propsValue is visited to get the properties, but we don't emit it as the object
      // is contained within a JSXOpeningElement
      this.serializedValues.add(propsValue);
      // have to case propsValue to ObjectValue or Flow complains that propsValues can be null/undefined
      for (let [key, propertyBinding] of (propsValue: ObjectValue).properties) {
        let desc = propertyBinding.descriptor;
        if (desc === undefined) continue; // deleted
        invariant(!IsAccessorDescriptor(this.realm, desc), "expected descriptor to be a non-accessor property");

        invariant(key !== "key" && key !== "ref", `"${key}" is a reserved prop name`);

        if (key === "children" && desc.value !== undefined) {
          let childrenValue = desc.value;
          if (childrenValue instanceof ArrayValue) {
            this.serializedValues.add(childrenValue);
            let childrenLength = Get(this.realm, childrenValue, "length");
            let childrenLengthValue = 0;
            if (childrenLength instanceof NumberValue) {
              childrenLengthValue = childrenLength.value;
              for (let i = 0; i < childrenLengthValue; i++) {
                let child = Get(this.realm, childrenValue, "" + i);
                if (child instanceof Value) {
                  children.push(this._serializeValueReactElementChild(child));
                } else {
                  this.logger.logError(val, `JSXElement "props.children[${i}]" failed to serialize due to a non-value`);
                }
              }
              continue;
            }
          }
          // otherwise it must be a value, as desc.value !== undefined.
          children.push(this._serializeValueReactElementChild(((childrenValue: any): Value)));
          continue;
        }
        if (desc.value instanceof Value) {
          attributes.push(convertKeyValueToJSXAttribute(key, this.serializeValue(desc.value)));
        }
      }
    }
    let openingElement = t.jSXOpeningElement(identifier, (attributes: any), children.length === 0);
    let closingElement = t.jSXClosingElement(identifier);

    let jsxElement = t.jSXElement(openingElement, closingElement, children, children.length === 0);
    // if there has been a bail-out, we create an inline BlockComment node before the JSX element
    if (val.$BailOutReason !== undefined) {
      // $BailOutReason contains an optional string of what to print out in the comment
      jsxElement.leadingComments = [({ type: "BlockComment", value: `${val.$BailOutReason}` }: any)];
    }
    return jsxElement;
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
        this.emitter.getReasonToWaitForActiveValue(val, mightHaveBeenDeleted || mapConstructorDoesntTakeArguments);
      if (delayReason) {
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
        this.emitter.getReasonToWaitForDependencies(entry) ||
        this.emitter.getReasonToWaitForActiveValue(val, mightHaveBeenDeleted || setConstructorDoesntTakeArguments);
      if (delayReason) {
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

    invariant(!(val instanceof NativeFunctionValue), "all native function values should be intrinsics");
    invariant(val instanceof ECMAScriptSourceFunctionValue);

    let instance = this.residualFunctionInstances.get(val);
    invariant(instance);
    let residualBindings = instance.residualFunctionBindings;

    let inAdditionalFunction = this.currentFunctionBody !== this.mainBody;
    if (inAdditionalFunction) instance.containingAdditionalFunction = this.currentAdditionalFunction;
    let delayed = 1;
    let undelay = () => {
      if (--delayed === 0) {
        invariant(instance);
        instance.insertionPoint = this.emitter.getBodyReference();
      }
    };
    for (let [boundName, residualBinding] of residualBindings) {
      let referencedValues = [];
      let serializeBindingFunc;
      if (!residualBinding.declarativeEnvironmentRecord) {
        serializeBindingFunc = () => this._serializeGlobalBinding(boundName, residualBinding);
      } else {
        serializeBindingFunc = () => {
          return this._serializeDeclarativeEnvironmentRecordBinding(residualBinding);
        };
        let bindingValue = residualBinding.value;
        invariant(bindingValue !== undefined);
        referencedValues.push(bindingValue);
        if (inAdditionalFunction) {
          let scopes = this.residualValues.get(bindingValue);
          invariant(scopes);
          let { usedOnlyByAdditionalFunctions } = this._getTarget(bindingValue, scopes);
          if (usedOnlyByAdditionalFunctions)
            residualBinding.referencedOnlyFromAdditionalFunctions = this.currentAdditionalFunction;
        }
      }
      delayed++;
      this.emitter.emitNowOrAfterWaitingForDependencies(referencedValues, () => {
        serializeBindingFunc();
        undelay();
      });
    }

    undelay();

    this._emitObjectProperties(val);
  }

  // Checks whether a property can be defined via simple assignment, or using object literal syntax.
  _canEmbedProperty(obj: ObjectValue, key: string | SymbolValue, prop: Descriptor): boolean {
    if ((obj instanceof FunctionValue && key === "prototype") || (obj.getKind() === "RegExp" && key === "lastIndex"))
      return !!prop.writable && !prop.configurable && !prop.enumerable && !prop.set && !prop.get;
    else return !!prop.writable && !!prop.configurable && !!prop.enumerable && !prop.set && !prop.get;
  }

  _findLastObjectPrototype(obj: ObjectValue): ObjectValue {
    while (obj.$Prototype instanceof ObjectValue) obj = obj.$Prototype;
    return obj;
  }

  _serializeValueRegExpObject(val: ObjectValue): BabelNodeExpression {
    let source = val.$OriginalSource;
    let flags = val.$OriginalFlags;
    invariant(typeof source === "string");
    invariant(typeof flags === "string");
    this._emitObjectProperties(val);
    source = new RegExp(source).source; // add escapes as per 21.2.3.2.4
    return t.regExpLiteral(source, flags);
  }

  // Overridable.
  serializeValueRawObject(val: ObjectValue): BabelNodeExpression {
    let proto = val.$Prototype;
    let createViaAuxiliaryConstructor =
      proto !== this.realm.intrinsics.ObjectPrototype &&
      this._findLastObjectPrototype(val) === this.realm.intrinsics.ObjectPrototype &&
      proto instanceof ObjectValue;

    let remainingProperties = new Map(val.properties);
    const dummyProperties = new Set();
    let props = [];
    for (let [key, propertyBinding] of val.properties) {
      let descriptor = propertyBinding.descriptor;
      if (descriptor === undefined || descriptor.value === undefined) continue; // deleted
      if (!createViaAuxiliaryConstructor && this._canEmbedProperty(val, key, descriptor)) {
        let propValue = descriptor.value;
        invariant(propValue instanceof Value);
        if (this.residualHeapInspector.canIgnoreProperty(val, key)) continue;
        let mightHaveBeenDeleted = propValue.mightHaveBeenDeleted();
        let serializedKey = this.generator.getAsPropertyNameExpression(key);
        let delayReason =
          this.emitter.getReasonToWaitForDependencies(propValue) ||
          this.emitter.getReasonToWaitForActiveValue(val, mightHaveBeenDeleted);
        // Although the property needs to be delayed, we still want to emit dummy "undefined"
        // value as part of the object literal to ensure a consistent property ordering.
        let serializedValue = voidExpression;
        if (delayReason) {
          // May need to be cleaned up later.
          dummyProperties.add(key);
        } else {
          remainingProperties.delete(key);
          serializedValue = this.serializeValue(propValue);
        }
        props.push(t.objectProperty(serializedKey, serializedValue));
      }
    }
    this._emitObjectProperties(val, remainingProperties, createViaAuxiliaryConstructor, dummyProperties);

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
        return this._serializeValueRegExpObject(val);
      case "Number":
        let numberData = val.$NumberData;
        invariant(numberData !== undefined);
        numberData.throwIfNotConcreteNumber();
        invariant(numberData instanceof NumberValue, "expected number data internal slot to be a number value");
        this._emitObjectProperties(val);
        return t.newExpression(this.preludeGenerator.memoizeReference("Number"), [t.numericLiteral(numberData.value)]);
      case "String":
        let stringData = val.$StringData;
        invariant(stringData !== undefined);
        stringData.throwIfNotConcreteString();
        invariant(stringData instanceof StringValue, "expected string data internal slot to be a string value");
        this._emitObjectProperties(val);
        return t.newExpression(this.preludeGenerator.memoizeReference("String"), [t.stringLiteral(stringData.value)]);
      case "Boolean":
        let booleanData = val.$BooleanData;
        invariant(booleanData !== undefined);
        booleanData.throwIfNotConcreteBoolean();
        invariant(booleanData instanceof BooleanValue, "expected boolean data internal slot to be a boolean value");
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
      case "ReactElement":
        return this._serializeValueReactElement(val);
      case "Map":
      case "WeakMap":
        return this._serializeValueMap(val);
      case "Set":
      case "WeakSet":
        return this._serializeValueSet(val);
      default:
        invariant(kind === "Object", "invariant established by visitor");
        invariant(this.$ParameterMap === undefined, "invariant established by visitor");
        return this.serializeValueRawObject(val);
    }
  }

  _serializeValueSymbol(val: SymbolValue): BabelNodeExpression {
    let args = [];
    if (val.$Description instanceof Value) {
      let serializedArg = this.serializeValue(val.$Description);
      invariant(serializedArg);
      args.push(serializedArg);
    }
    // check if symbol value exists in the global symbol map, in that case we emit an invocation of System.for
    // to look it up
    let globalReg = this.realm.globalSymbolRegistry.find(e => e.$Symbol === val) !== undefined;
    if (globalReg) {
      return t.callExpression(this.preludeGenerator.memoizeReference("Symbol.for"), args);
    } else {
      return t.callExpression(this.preludeGenerator.memoizeReference("Symbol"), args);
    }
  }

  _serializeValueProxy(val: ProxyValue): BabelNodeExpression {
    return t.newExpression(this.preludeGenerator.memoizeReference("Proxy"), [
      this.serializeValue(val.$ProxyTarget),
      this.serializeValue(val.$ProxyHandler),
    ]);
  }

  _serializeAbstractValueHelper(val: AbstractValue): BabelNodeExpression {
    let serializedArgs = val.args.map((abstractArg, i) => this.serializeValue(abstractArg));
    let serializedValue = val.buildNode(serializedArgs);
    if (serializedValue.type === "Identifier") {
      let id = ((serializedValue: any): BabelNodeIdentifier);
      invariant(!this.preludeGenerator.derivedIds.has(id.name) || this.emitter.hasBeenDeclared(val));
    }
    return serializedValue;
  }

  _serializeAbstractValue(val: AbstractValue): void | BabelNodeExpression {
    invariant(val.kind !== "sentinel member expression", "invariant established by visitor");
    if (val.hasIdentifier()) {
      return this._serializeAbstractValueHelper(val);
    } else {
      // This abstract value's dependencies should all be declared
      // but still need to check it again in case their serialized bodies are in different generator scope.
      this.emitter.emitNowOrAfterWaitingForDependencies(val.args, () => {
        const serializedValue = this._serializeAbstractValueHelper(val);
        let uid = this.getSerializeObjectIdentifier(val);
        let declar = t.variableDeclaration("var", [t.variableDeclarator(uid, serializedValue)]);
        this.emitter.emit(declar);
      });
    }
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
    } else {
      invariant(val instanceof ObjectValue);
      return this._serializeValueObject(val);
    }
  }

  _serializeGlobalBinding(boundName: string, residualFunctionBinding: ResidualFunctionBinding) {
    invariant(!residualFunctionBinding.declarativeEnvironmentRecord);
    if (!residualFunctionBinding.serializedValue) {
      residualFunctionBinding.referentialized = true;
      if (boundName === "undefined") {
        residualFunctionBinding.serializedValue = voidExpression;
      } else {
        let value = this.realm.getGlobalLetBinding(boundName);
        // Check for let binding vs global property
        if (value) {
          let rval = residualFunctionBinding.value;
          invariant(rval !== undefined && value.equals(rval));
          let id = this.serializeValue(rval, true, "let");
          // increment ref count one more time as the value has been
          // referentialized (stored in a variable) by serializeValue
          this.residualHeapValueIdentifiers.incrementReferenceCount(rval);
          residualFunctionBinding.serializedValue = id;
        } else {
          residualFunctionBinding.serializedValue = this.preludeGenerator.globalReference(boundName);
        }
      }
    }
  }

  _withGeneratorScope(generator: Generator, callback: SerializedBody => void): Array<BabelNodeStatement> {
    let newBody = { type: "Generator", entries: [] };
    let oldBody = this.emitter.beginEmitting(generator, newBody);
    this.activeGeneratorBodies.set(generator, newBody);
    callback(newBody);
    this.activeGeneratorBodies.delete(generator);
    return this.emitter.endEmitting(generator, oldBody).entries;
  }

  _getContext(): SerializationContext {
    // TODO #482: Values serialized by nested generators would currently only get defined
    // along the code of the nested generator; their definitions need to get hoisted
    // or repeated so that they are accessible and defined from all using scopes
    let context = {
      serializeValue: this.serializeValue.bind(this),
      serializeGenerator: (generator: Generator): Array<BabelNodeStatement> => {
        return this._withGeneratorScope(generator, () => generator.serialize(context));
      },
      emit: (statement: BabelNodeStatement) => {
        this.emitter.emit(statement);
      },
      emitDefinePropertyBody: this.emitDefinePropertyBody.bind(this),
      canOmit: (value: AbstractValue) => {
        return !this.referencedDeclaredValues.has(value);
      },
      declare: (value: AbstractValue) => {
        this.emitter.declare(value);
      },
    };
    return context;
  }

  _serializeAdditionalFunction(generator: Generator, postGeneratorCallback: () => void) {
    let context = this._getContext();
    return this._withGeneratorScope(generator, newBody => {
      let oldCurBody = this.currentFunctionBody;
      this.currentFunctionBody = newBody;
      generator.serialize(context);
      if (postGeneratorCallback) postGeneratorCallback();
      this.currentFunctionBody = oldCurBody;
    });
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

  processAdditionalFunctionValues(): Map<FunctionValue, Array<BabelNodeStatement>> {
    let rewrittenAdditionalFunctions: Map<FunctionValue, Array<BabelNodeStatement>> = new Map();
    let shouldEmitLog = !this.residualHeapValueIdentifiers.collectValToRefCountOnly;
    let processAdditionalFunctionValuesFn = () => {
      let additionalFVEffects = this.additionalFunctionValuesAndEffects;
      if (additionalFVEffects) {
        for (let [additionalFunctionValue, effects] of additionalFVEffects.entries()) {
          let [
            result,
            generator,
            modifiedBindings,
            modifiedProperties: Map<PropertyBinding, void | Descriptor>,
            createdObjects,
          ] = effects;
          let nestedFunctions = new Set([...createdObjects].filter(object => object instanceof FunctionValue));
          // result -- ignore TODO: return the result from the function somehow
          // Generator -- visit all entries
          // Bindings -- only need to serialize bindings if they're captured by some nested function ??
          //          -- need to apply them and maybe need to revisit functions in ancestors to make sure
          //          -- we don't overwrite anything they capture
          //          -- TODO: deal with these properly
          // PropertyBindings -- visit any property bindings that aren't to createdobjects
          // CreatedObjects -- should take care of itself
          this.realm.applyEffects([
            result,
            new Generator(this.realm),
            modifiedBindings,
            modifiedProperties,
            createdObjects,
          ]);
          // Allows us to emit function declarations etc. inside of this additional
          // function instead of adding them at global scope
          // TODO: make sure this generator isn't getting mutated oddly
          ((nestedFunctions: any): Set<FunctionValue>).forEach(val =>
            this.additionalFunctionValueNestedFunctions.add(val)
          );
          let serializePropertiesAndBindings = () => {
            for (let propertyBinding of modifiedProperties.keys()) {
              let binding: PropertyBinding = ((propertyBinding: any): PropertyBinding);
              let object = binding.object;
              if (object instanceof ObjectValue && createdObjects.has(object)) continue;
              if (object.refuseSerialization) continue;
              if (object.isIntrinsic()) continue;
              invariant(object instanceof ObjectValue);
              this._emitProperty(object, binding.key, binding.descriptor, true);
            }
            invariant(result instanceof Value);
            // Handle ModifiedBindings
            let additionalFunctionValueInfo = this.additionalFunctionValueInfos.get(additionalFunctionValue);
            invariant(additionalFunctionValueInfo);
            for (let [modifiedBinding, residualBinding] of additionalFunctionValueInfo.modifiedBindings) {
              let newVal = modifiedBinding.value;
              invariant(newVal);
              residualBinding.additionalValueSerialized = this.serializeValue(newVal);
            }
            this.emitter.emit(t.returnStatement(this.serializeValue(result)));
          };
          this.currentAdditionalFunction = additionalFunctionValue;
          let body = this._serializeAdditionalFunction(generator, serializePropertiesAndBindings);
          invariant(additionalFunctionValue instanceof ECMAScriptSourceFunctionValue);
          rewrittenAdditionalFunctions.set(additionalFunctionValue, body);
          // re-resolve initialized modules to include things from additional functions
          this.modules.resolveInitializedModules();
          if (shouldEmitLog && this.modules.moduleIds.size > 0)
            console.log(
              `=== ${this.modules.initializedModules.size} of ${this.modules.moduleIds
                .size} modules initialized after additional function ${additionalFunctionValue.intrinsicName
                ? additionalFunctionValue.intrinsicName
                : ""}`
            );
          // These don't restore themselves properly otherwise.
          this.realm.restoreBindings(modifiedBindings);
          this.realm.restoreProperties(modifiedProperties);
        }
      }
      return this.realm.intrinsics.undefined;
    };
    this.realm.evaluateAndRevertInGlobalEnv(processAdditionalFunctionValuesFn);
    return rewrittenAdditionalFunctions;
  }

  // Hook point for any serialization needs to be done after generator serialization is complete.
  postGeneratorSerialization(): void {
    // For overriding only.
  }

  serialize(): BabelNodeFile {
    this.generator.serialize(this._getContext());
    invariant(this.emitter._declaredAbstractValues.size <= this.preludeGenerator.derivedIds.size);

    this.postGeneratorSerialization();
    Array.prototype.push.apply(this.prelude, this.preludeGenerator.prelude);

    // TODO #20: add timers

    // TODO #21: add event listeners

    for (let [moduleId, moduleValue] of this.modules.initializedModules)
      this.requireReturns.set(moduleId, this.serializeValue(moduleValue));

    // Make sure additional functions get serialized.
    let rewrittenAdditionalFunctions = this.processAdditionalFunctionValues();

    this.modules.resolveInitializedModules();

    this.emitter.finalize();

    this.residualFunctions.residualFunctionInitializers.factorifyInitializers(this.factoryNameGenerator);
    let { unstrictFunctionBodies, strictFunctionBodies, requireStatistics } = this.residualFunctions.spliceFunctions(
      rewrittenAdditionalFunctions
    );
    if (this.modules.moduleIds.size > 0 && !this.residualHeapValueIdentifiers.collectValToRefCountOnly) {
      console.log(
        `=== ${this.modules.initializedModules.size} of ${this.modules.moduleIds
          .size} modules initialized, ${requireStatistics.replaced} of ${requireStatistics.count} require calls inlined.`
      );
    }

    // add strict modes
    let strictDirective = t.directive(t.directiveLiteral("use strict"));
    let globalDirectives = [];
    if (!this.realm.isStrict && !unstrictFunctionBodies.length && strictFunctionBodies.length) {
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
    if (this.needsEmptyVar) {
      this.prelude.push(t.variableDeclaration("var", [t.variableDeclarator(emptyExpression, t.objectExpression([]))]));
    }
    if (this.needsAuxiliaryConstructor) {
      this.prelude.push(
        t.variableDeclaration("var", [
          t.variableDeclarator(constructorExpression, t.functionExpression(null, [], t.blockStatement([]))),
        ])
      );
    }

    let body = this.prelude.concat(this.emitter.getBody().entries);
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

    invariant(
      this.serializedValues.size === this.residualValues.size,
      "serialized " + this.serializedValues.size + " of " + this.residualValues.size
    );

    // TODO: find better way to do this?
    // revert changes to functionInstances in case we do multiple serialization passes
    for (let instance of this.residualFunctionInstances.values()) {
      for (let binding of ((instance: any): FunctionInstance).residualFunctionBindings.values()) {
        let b = ((binding: any): ResidualFunctionBinding);
        delete b.serializedValue;
        delete b.referentialized;
      }
    }

    let program_directives = [];
    if (this.realm.isStrict) program_directives.push(strictDirective);
    return t.file(t.program(ast_body, program_directives));
  }
}
