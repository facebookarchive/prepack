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
import { IsArray, Get } from "../methods/index.js";
import {
  AbstractValue,
  BooleanValue,
  BoundFunctionValue,
  ECMAScriptSourceFunctionValue,
  EmptyValue,
  FunctionValue,
  NativeFunctionValue,
  NumberValue,
  ObjectValue,
  ProxyValue,
  StringValue,
  SymbolValue,
  Value,
  UndefinedValue,
} from "../values/index.js";
import * as t from "@babel/types";
import type {
  BabelNodeExpression,
  BabelNodeStatement,
  BabelNodeIdentifier,
  BabelNodeBlockStatement,
  BabelNodeLVal,
  BabelNodeMemberExpression,
  BabelNodeSpreadElement,
  BabelVariableKind,
  BabelNodeFile,
  BabelNodeFunctionExpression,
} from "@babel/types";
import { Generator } from "../utils/generator.js";
import { PreludeGenerator } from "../utils/PreludeGenerator.js";
import { NameGenerator } from "../utils/NameGenerator.js";
import type { SerializationContext } from "../utils/generator.js";
import invariant from "../invariant.js";
import type {
  ResidualFunctionBinding,
  FunctionInfo,
  FunctionInstance,
  AdditionalFunctionInfo,
  SerializedBody,
  ClassMethodInstance,
  AdditionalFunctionEffects,
} from "./types.js";
import type { SerializerOptions } from "../options.js";
import { type Scope, BodyReference, type ResidualHeapInfo } from "./types.js";
import { SerializerStatistics } from "./statistics.js";
import { Logger } from "../utils/logger.js";
import { Modules } from "../utils/modules.js";
import { HeapInspector } from "../utils/HeapInspector.js";
import { ResidualFunctions } from "./ResidualFunctions.js";
import { factorifyObjects } from "./factorify.js";
import { voidExpression, emptyExpression, constructorExpression, protoExpression } from "../utils/babelhelpers.js";
import { Emitter } from "./Emitter.js";
import { ResidualHeapValueIdentifiers } from "./ResidualHeapValueIdentifiers.js";
import {
  commonAncestorOf,
  getSuggestedArrayLiteralLength,
  withDescriptorValue,
  ClassPropertiesToIgnore,
  canIgnoreClassLengthProperty,
  getObjectPrototypeMetadata,
} from "./utils.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { canHoistFunction } from "../react/hoisting.js";
import { To } from "../singletons.js";
import { ResidualReactElementSerializer } from "./ResidualReactElementSerializer.js";
import type { Binding } from "../environment.js";
import { GlobalEnvironmentRecord, DeclarativeEnvironmentRecord } from "../environment.js";
import type { Referentializer } from "./Referentializer.js";
import { GeneratorTree } from "./GeneratorTree.js";
import { type Replacement, getReplacement } from "./ResidualFunctionInstantiator.js";
import { describeValue } from "../utils.js";
import { getAsPropertyNameExpression } from "../utils/babelhelpers.js";
import { ResidualOperationSerializer } from "./ResidualOperationSerializer.js";
import { PropertyDescriptor, AbstractJoinedDescriptor } from "../descriptors.js";
import type { ResidualOptimizedFunctions } from "./ResidualOptimizedFunctions";

function commentStatement(text: string) {
  let s = t.emptyStatement();
  s.leadingComments = [({ type: "BlockComment", value: text }: any)];
  return s;
}

class CountingSemaphore {
  count: number;
  action: () => void;
  constructor(action: () => void, initialCount: number = 1) {
    invariant(initialCount >= 1);
    this.count = initialCount;
    this.action = action;
  }
  acquireOne() {
    this.count++;
  }
  releaseOne() {
    invariant(this.count > 0);
    if (--this.count === 0) this.action();
  }
}

export class ResidualHeapSerializer {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    residualHeapValueIdentifiers: ResidualHeapValueIdentifiers,
    residualHeapInspector: HeapInspector,
    residualHeapInfo: ResidualHeapInfo,
    options: SerializerOptions,
    additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>,
    referentializer: Referentializer,
    generatorTree: GeneratorTree,
    residualOptimizedFunctions: ResidualOptimizedFunctions
  ) {
    this.realm = realm;
    this.logger = logger;
    this.modules = modules;
    this.residualHeapValueIdentifiers = residualHeapValueIdentifiers;
    this.referentializer = referentializer;
    this._residualOptimizedFunctions = residualOptimizedFunctions;

    let realmGenerator = this.realm.generator;
    invariant(realmGenerator);
    this.generator = realmGenerator;
    let realmPreludeGenerator = this.realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;
    this.residualOperationSerializer = new ResidualOperationSerializer(realm, realmPreludeGenerator);

    this.prelude = [];
    this._descriptors = new Map();
    this.needsEmptyVar = false;
    this.needsAuxiliaryConstructor = false;
    this.descriptorNameGenerator = this.preludeGenerator.createNameGenerator("$$");
    this.factoryNameGenerator = this.preludeGenerator.createNameGenerator("$_");
    this.intrinsicNameGenerator = this.preludeGenerator.createNameGenerator("$i_");
    this.functionNameGenerator = this.preludeGenerator.createNameGenerator("$f_");
    this.initializeConditionNameGenerator = this.preludeGenerator.createNameGenerator("_initialized");
    this.initializerNameGenerator = this.preludeGenerator.createNameGenerator("__init_");
    this.requireReturns = new Map();
    this.serializedValues = new Set();
    this._serializedValueWithIdentifiers = new Set();
    this.additionalFunctionValueNestedFunctions = new Set();
    this.residualReactElementSerializer = new ResidualReactElementSerializer(
      this.realm,
      this,
      residualOptimizedFunctions
    );
    this.residualFunctions = new ResidualFunctions(
      this.realm,
      options,
      this.modules,
      this.requireReturns,
      {
        getContainingAdditionalFunction: functionValue => {
          let instance = this.residualFunctionInstances.get(functionValue);
          invariant(instance !== undefined);
          return instance.containingAdditionalFunction;
        },
        getLocation: value => this.getSerializeObjectIdentifier(value),
        createLocation: containingAdditionalFunction => {
          let location = t.identifier(this.initializeConditionNameGenerator.generate());
          let declar = t.variableDeclaration("var", [t.variableDeclarator(location)]);
          this.getPrelude(containingAdditionalFunction).push(declar);
          return location;
        },
        createFunction: (containingAdditionalFunction, statements) => {
          let id = t.identifier(this.initializerNameGenerator.generate());
          this.getPrelude(containingAdditionalFunction).push(
            t.functionDeclaration(id, [], t.blockStatement(statements))
          );
          return id;
        },
      },
      this.prelude,
      this.factoryNameGenerator,
      residualHeapInfo.functionInfos,
      residualHeapInfo.functionInstances,
      residualHeapInfo.classMethodInstances,
      residualHeapInfo.additionalFunctionValueInfos,
      this.additionalFunctionValueNestedFunctions,
      referentializer
    );
    this.emitter = new Emitter(
      this.residualFunctions,
      residualHeapInfo.referencedDeclaredValues,
      residualHeapInfo.conditionalFeasibility,
      this.realm.derivedIds
    );
    this.mainBody = this.emitter.getBody();
    this.residualHeapInspector = residualHeapInspector;
    this.residualValues = residualHeapInfo.values;
    this.residualFunctionInstances = residualHeapInfo.functionInstances;
    this.residualClassMethodInstances = residualHeapInfo.classMethodInstances;
    this.residualFunctionInfos = residualHeapInfo.functionInfos;
    this._options = options;
    this.referencedDeclaredValues = residualHeapInfo.referencedDeclaredValues;
    this.activeGeneratorBodies = new Map();
    this.additionalFunctionValuesAndEffects = additionalFunctionValuesAndEffects;
    this.additionalFunctionValueInfos = residualHeapInfo.additionalFunctionValueInfos;
    this.rewrittenAdditionalFunctions = new Map();
    this.declarativeEnvironmentRecordsBindings = residualHeapInfo.declarativeEnvironmentRecordsBindings;
    this.globalBindings = residualHeapInfo.globalBindings;
    this.generatorTree = generatorTree;
    this.conditionalFeasibility = residualHeapInfo.conditionalFeasibility;
    this.additionalFunctionGenerators = new Map();
    this.declaredGlobalLets = new Map();
    this._objectSemaphores = new Map();
    this.additionalGeneratorRoots = residualHeapInfo.additionalGeneratorRoots;
    let environment = realm.$GlobalEnv.environmentRecord;
    invariant(environment instanceof GlobalEnvironmentRecord);
    this.globalEnvironmentRecord = environment;
  }

  emitter: Emitter;
  functions: Map<BabelNodeBlockStatement, Array<FunctionInstance>>;
  functionInstances: Array<FunctionInstance>;
  prelude: Array<BabelNodeStatement>;
  body: Array<BabelNodeStatement>;
  mainBody: SerializedBody;
  realm: Realm;
  residualOperationSerializer: ResidualOperationSerializer;
  preludeGenerator: PreludeGenerator;
  generator: Generator;
  _descriptors: Map<string, BabelNodeIdentifier>;
  needsEmptyVar: boolean;
  needsAuxiliaryConstructor: boolean;
  descriptorNameGenerator: NameGenerator;
  factoryNameGenerator: NameGenerator;
  intrinsicNameGenerator: NameGenerator;
  functionNameGenerator: NameGenerator;
  initializeConditionNameGenerator: NameGenerator;
  initializerNameGenerator: NameGenerator;
  logger: Logger;
  modules: Modules;
  residualHeapValueIdentifiers: ResidualHeapValueIdentifiers;
  requireReturns: Map<number | string, Replacement>;
  residualHeapInspector: HeapInspector;
  residualValues: Map<Value, Set<Scope>>;
  residualFunctionInstances: Map<FunctionValue, FunctionInstance>;
  residualClassMethodInstances: Map<FunctionValue, ClassMethodInstance>;
  residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  serializedValues: Set<Value>;
  _serializedValueWithIdentifiers: Set<Value>;
  residualFunctions: ResidualFunctions;
  _options: SerializerOptions;
  referencedDeclaredValues: Map<Value, void | FunctionValue>;
  activeGeneratorBodies: Map<Generator, SerializedBody>;
  additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>;
  additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>;
  rewrittenAdditionalFunctions: Map<FunctionValue, Array<BabelNodeStatement>>;
  declarativeEnvironmentRecordsBindings: Map<DeclarativeEnvironmentRecord, Map<string, ResidualFunctionBinding>>;
  globalBindings: Map<string, ResidualFunctionBinding>;
  residualReactElementSerializer: ResidualReactElementSerializer;
  referentializer: Referentializer;
  additionalFunctionGenerators: Map<FunctionValue, Generator>;
  _residualOptimizedFunctions: ResidualOptimizedFunctions;

  // function values nested in additional functions can't delay initializations
  // TODO: revisit this and fix additional functions to be capable of delaying initializations
  additionalFunctionValueNestedFunctions: Set<FunctionValue>;

  generatorTree: GeneratorTree;
  conditionalFeasibility: Map<AbstractValue, { t: boolean, f: boolean }>;
  additionalGeneratorRoots: Map<Generator, Set<ObjectValue>>;

  declaredGlobalLets: Map<string, Value>;
  globalEnvironmentRecord: GlobalEnvironmentRecord;

  getStatistics(): SerializerStatistics {
    invariant(this.realm.statistics instanceof SerializerStatistics, "serialization requires SerializerStatistics");
    return this.realm.statistics;
  }

  _objectSemaphores: Map<ObjectValue, CountingSemaphore>;

  _acquireOneObjectSemaphore(object: ObjectValue): void | CountingSemaphore {
    let semaphore = this._objectSemaphores.get(object);
    if (semaphore !== undefined) semaphore.acquireOne();
    return semaphore;
  }

  // Configures all mutable aspects of an object, in particular:
  // symbols, properties, prototype.
  // For every created object that corresponds to a value,
  // this function should be invoked once.
  // Thus, as a side effect, we gather statistics here on all emitted objects.
  _emitObjectProperties(
    obj: ObjectValue,
    properties: Map<string, PropertyBinding> = obj.properties,
    objectPrototypeAlreadyEstablished: boolean = false,
    cleanupDummyProperties: ?Set<string>,
    skipPrototype: boolean = false
  ): void {
    //inject symbols
    for (let [symbol, propertyBinding] of obj.symbols) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      let semaphore = this._acquireOneObjectSemaphore(obj);
      this.emitter.emitNowOrAfterWaitingForDependencies(
        this._getDescriptorValues(desc).concat([symbol, obj]),
        () => {
          invariant(desc !== undefined);
          this._emitProperty(obj, symbol, desc);
          if (semaphore !== undefined) semaphore.releaseOne();
        },
        this.emitter.getBody()
      );
    }

    // TODO #2259: Make deduplication in the face of leaking work for custom accessors
    let isCertainlyLeaked = !obj.mightNotBeLeakedObject();
    let shouldDropAsAssignedProp = (descriptor: Descriptor | void) =>
      isCertainlyLeaked &&
      (descriptor instanceof PropertyDescriptor && (descriptor.get === undefined && descriptor.set === undefined));

    // inject properties
    for (let [key, propertyBinding] of properties) {
      invariant(propertyBinding);

      if (propertyBinding.pathNode !== undefined) continue; // Property is assigned to inside loop
      let desc = propertyBinding.descriptor;

      if (shouldDropAsAssignedProp(desc)) continue;

      if (desc === undefined) continue; //deleted
      if (this.residualHeapInspector.canIgnoreProperty(obj, key)) continue;
      invariant(desc !== undefined);
      let semaphore = this._acquireOneObjectSemaphore(obj);
      let body = this.emitter.getBody();
      this.emitter.emitNowOrAfterWaitingForDependencies(
        this._getDescriptorValues(desc).concat(obj),
        () => {
          invariant(desc !== undefined);
          this._emitProperty(obj, key, desc, cleanupDummyProperties != null && cleanupDummyProperties.has(key));
          if (semaphore !== undefined) semaphore.releaseOne();
        },
        body
      );
    }

    // inject properties with computed names
    if (obj.unknownProperty !== undefined) {
      let desc = obj.unknownProperty.descriptor;
      if (desc !== undefined) {
        let semaphore = this._acquireOneObjectSemaphore(obj);
        this.emitter.emitNowOrAfterWaitingForDependencies(
          this._getNestedValuesFromAbstractDescriptor(desc, [obj]),
          () => {
            this._emitPropertiesWithComputedNamesDescriptor(obj, desc);
            if (semaphore !== undefined) semaphore.releaseOne();
          },
          this.emitter.getBody()
        );
      }
    }

    // prototype
    if (!skipPrototype) {
      this._emitObjectPrototype(obj, objectPrototypeAlreadyEstablished);
      if (obj instanceof FunctionValue) this._emitConstructorPrototype(obj);
    }

    this.getStatistics().objects++;
    this.getStatistics().objectProperties += obj.properties.size;
  }

  _emitObjectPrototype(obj: ObjectValue, objectPrototypeAlreadyEstablished: boolean): void {
    let kind = obj.getKind();
    let proto = obj.$Prototype;
    if (objectPrototypeAlreadyEstablished) {
      if (this.realm.invariantLevel >= 3) {
        this.emitter.emitNowOrAfterWaitingForDependencies(
          [proto, obj],
          () => {
            invariant(proto);
            let serializedProto = this.serializeValue(proto);
            let uid = this.getSerializeObjectIdentifier(obj);
            const fetchedPrototype =
              this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION) || this.realm.isCompatibleWith("mobile")
                ? t.memberExpression(uid, protoExpression)
                : t.callExpression(this.preludeGenerator.memoizeReference("Object.getPrototypeOf"), [uid]);
            let condition = t.binaryExpression("!==", fetchedPrototype, serializedProto);
            let consequent = this.residualOperationSerializer.getErrorStatement(
              t.stringLiteral("unexpected prototype")
            );
            this.emitter.emit(t.ifStatement(condition, consequent));
          },
          this.emitter.getBody()
        );
      }
      return;
    }
    if (proto === this.realm.intrinsics[kind + "Prototype"]) return;

    let semaphore = this._acquireOneObjectSemaphore(obj);
    this.emitter.emitNowOrAfterWaitingForDependencies(
      [proto, obj],
      () => {
        invariant(proto);
        let serializedProto = this.serializeValue(proto);
        let uid = this.getSerializeObjectIdentifier(obj);
        if (!this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION) && !this.realm.isCompatibleWith("mobile"))
          this.emitter.emit(
            t.expressionStatement(
              t.callExpression(this.preludeGenerator.memoizeReference("Object.setPrototypeOf"), [uid, serializedProto])
            )
          );
        else {
          this.emitter.emit(
            t.expressionStatement(
              t.assignmentExpression("=", t.memberExpression(uid, protoExpression), serializedProto)
            )
          );
        }
        if (semaphore !== undefined) semaphore.releaseOne();
      },
      this.emitter.getBody()
    );
  }

  _emitConstructorPrototype(func: FunctionValue): void {
    // If the original prototype object was mutated,
    // request its serialization here as this might be observable by
    // residual code.
    let prototype = HeapInspector.getPropertyValue(func, "prototype");
    if (prototype instanceof ObjectValue && this.residualValues.has(prototype)) {
      this.emitter.emitNowOrAfterWaitingForDependencies(
        [prototype],
        () => {
          invariant(prototype instanceof Value);
          this.serializeValue(prototype);
        },
        this.emitter.getBody()
      );
    }
  }

  _getNestedValuesFromAbstractDescriptor(desc: void | Descriptor, values: Array<Value>): Array<Value> {
    if (desc === undefined) return values;
    if (desc instanceof PropertyDescriptor) {
      let val = desc.value;
      invariant(val instanceof AbstractValue);
      return this._getNestedValuesFromAbstract(val, values);
    } else if (desc instanceof AbstractJoinedDescriptor) {
      values.push(desc.joinCondition);
      this._getNestedValuesFromAbstractDescriptor(desc.descriptor1, values);
      this._getNestedValuesFromAbstractDescriptor(desc.descriptor2, values);
      return values;
    } else {
      invariant(false, "unknown descriptor");
    }
  }

  _getNestedValuesFromAbstract(absVal: AbstractValue, values: Array<Value>): Array<Value> {
    if (absVal.kind === "widened property") return values;
    if (absVal.kind === "template for prototype member expression") return values;
    invariant(absVal.args.length === 3);
    let cond = absVal.args[0];
    invariant(cond instanceof AbstractValue);
    if (cond.kind === "template for property name condition") {
      let P = cond.args[0];
      values.push(P);
      let V = absVal.args[1];
      values.push(V);
      let W = absVal.args[2];
      if (W instanceof AbstractValue) this._getNestedValuesFromAbstract(W, values);
      else values.push(W);
    } else {
      // conditional assignment
      values.push(cond);
      let consequent = absVal.args[1];
      if (consequent instanceof AbstractValue) {
        this._getNestedValuesFromAbstract(consequent, values);
      } else {
        values.push(consequent);
      }
      let alternate = absVal.args[2];
      if (alternate instanceof AbstractValue) {
        this._getNestedValuesFromAbstract(alternate, values);
      } else {
        values.push(alternate);
      }
    }
    return values;
  }

  _emitPropertiesWithComputedNamesDescriptor(obj: ObjectValue, desc: void | Descriptor): void {
    if (desc === undefined) return;
    if (desc instanceof PropertyDescriptor) {
      let val = desc.value;
      invariant(val instanceof AbstractValue);
      this._emitPropertiesWithComputedNames(obj, val);
    } else if (desc instanceof AbstractJoinedDescriptor) {
      let serializedCond = this.serializeValue(desc.joinCondition);

      let valuesToProcess = new Set();
      let consequentStatement;
      let alternateStatement;

      if (desc.descriptor1) {
        let oldBody = this.emitter.beginEmitting(
          "consequent",
          {
            type: "ConditionalAssignmentBranch",
            parentBody: undefined,
            entries: [],
            done: false,
          },
          /*isChild*/ true
        );
        this._emitPropertiesWithComputedNamesDescriptor(obj, desc.descriptor1);
        let consequentBody = this.emitter.endEmitting("consequent", oldBody, valuesToProcess, /*isChild*/ true);
        consequentStatement = t.blockStatement(consequentBody.entries);
      }
      if (desc.descriptor2) {
        let oldBody = this.emitter.beginEmitting(
          "alternate",
          {
            type: "ConditionalAssignmentBranch",
            parentBody: undefined,
            entries: [],
            done: false,
          },
          /*isChild*/ true
        );
        this._emitPropertiesWithComputedNamesDescriptor(obj, desc.descriptor2);
        let alternateBody = this.emitter.endEmitting("alternate", oldBody, valuesToProcess, /*isChild*/ true);
        alternateStatement = t.blockStatement(alternateBody.entries);
      }
      if (consequentStatement) {
        this.emitter.emit(t.ifStatement(serializedCond, consequentStatement, alternateStatement));
      } else if (alternateStatement) {
        this.emitter.emit(t.ifStatement(t.unaryExpression("!", serializedCond), alternateStatement));
      }
      this.emitter.processValues(valuesToProcess);
    } else {
      invariant(false, "unknown descriptor");
    }
  }

  _emitPropertiesWithComputedNames(obj: ObjectValue, absVal: AbstractValue): void {
    if (absVal.kind === "widened property") return;
    if (absVal.kind === "template for prototype member expression") return;
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
      let valuesToProcess = new Set();
      let consequentStatement;
      let alternateStatement;

      if (consequent instanceof AbstractValue) {
        let oldBody = this.emitter.beginEmitting(
          "consequent",
          {
            type: "ConditionalAssignmentBranch",
            parentBody: undefined,
            entries: [],
            done: false,
          },
          /*isChild*/ true
        );
        this._emitPropertiesWithComputedNames(obj, consequent);
        let consequentBody = this.emitter.endEmitting("consequent", oldBody, valuesToProcess, /*isChild*/ true);
        consequentStatement = t.blockStatement(consequentBody.entries);
      }
      let alternate = absVal.args[2];
      if (alternate instanceof AbstractValue) {
        let oldBody = this.emitter.beginEmitting(
          "alternate",
          {
            type: "ConditionalAssignmentBranch",
            parentBody: undefined,
            entries: [],
            done: false,
          },
          /*isChild*/ true
        );
        this._emitPropertiesWithComputedNames(obj, alternate);
        let alternateBody = this.emitter.endEmitting("alternate", oldBody, valuesToProcess, /*isChild*/ true);
        alternateStatement = t.blockStatement(alternateBody.entries);
      }
      if (consequentStatement) {
        this.emitter.emit(t.ifStatement(serializedCond, consequentStatement, alternateStatement));
      } else if (alternateStatement) {
        this.emitter.emit(t.ifStatement(t.unaryExpression("!", serializedCond), alternateStatement));
      }
      this.emitter.processValues(valuesToProcess);
    }
  }

  // Overridable.
  getSerializeObjectIdentifier(val: Value): BabelNodeIdentifier {
    return this.residualHeapValueIdentifiers.getIdentifierAndIncrementReferenceCount(val);
  }

  _emitProperty(
    val: ObjectValue,
    key: string | SymbolValue | AbstractValue,
    desc: Descriptor | void,
    deleteIfMightHaveBeenDeleted: boolean = false
  ): void {
    // Location for the property to be assigned to
    let locationFunction = () => {
      let serializedKey =
        key instanceof SymbolValue || key instanceof AbstractValue
          ? this.serializeValue(key)
          : getAsPropertyNameExpression(key);
      let computed = key instanceof SymbolValue || key instanceof AbstractValue || !t.isIdentifier(serializedKey);
      return t.memberExpression(this.getSerializeObjectIdentifier(val), serializedKey, computed);
    };
    if (desc === undefined) {
      this._deleteProperty(locationFunction());
    } else {
      this.emitter.emit(this.emitDefinePropertyBody(deleteIfMightHaveBeenDeleted, locationFunction, val, key, desc));
    }
  }

  emitDefinePropertyBody(
    deleteIfMightHaveBeenDeleted: boolean,
    locationFunction: void | (() => BabelNodeLVal),
    val: ObjectValue,
    key: string | SymbolValue | AbstractValue,
    desc: Descriptor
  ): BabelNodeStatement {
    if (desc instanceof AbstractJoinedDescriptor) {
      let cond = this.serializeValue(desc.joinCondition);
      invariant(cond !== undefined);
      let trueBody;
      let falseBody;
      if (desc.descriptor1)
        trueBody = this.emitDefinePropertyBody(
          deleteIfMightHaveBeenDeleted,
          locationFunction,
          val,
          key,
          desc.descriptor1
        );
      if (desc.descriptor2)
        falseBody = this.emitDefinePropertyBody(
          deleteIfMightHaveBeenDeleted,
          locationFunction,
          val,
          key,
          desc.descriptor2
        );
      if (trueBody && falseBody) return t.ifStatement(cond, trueBody, falseBody);
      if (trueBody) return t.ifStatement(cond, trueBody);
      if (falseBody) return t.ifStatement(t.unaryExpression("!", cond), falseBody);
      invariant(false);
    }
    invariant(desc instanceof PropertyDescriptor);
    if (locationFunction !== undefined && this._canEmbedProperty(val, key, desc)) {
      let descValue = desc.value;
      invariant(descValue instanceof Value);
      invariant(!this.emitter.getReasonToWaitForDependencies([descValue, val]), "precondition of _emitProperty");
      let mightHaveBeenDeleted = descValue.mightHaveBeenDeleted();
      // The only case we do not need to remove the dummy property is array index property.
      return this._getPropertyAssignmentStatement(
        locationFunction(),
        descValue,
        mightHaveBeenDeleted,
        deleteIfMightHaveBeenDeleted
      );
    }
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
      if ((desc: any)[boolKey] !== undefined) {
        let b: boolean = (desc: any)[boolKey];
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
      if ((desc: any)[descKey] !== undefined) {
        let descValue: Value = (desc: any)[descKey];
        invariant(descValue instanceof Value);
        if (descValue instanceof UndefinedValue) {
          this.serializeValue(descValue);
          continue;
        }
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
      key instanceof SymbolValue || key instanceof AbstractValue
        ? this.serializeValue(key)
        : getAsPropertyNameExpression(key, /*canBeIdentifier*/ false);
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

  _serializeDeclarativeEnvironmentRecordBinding(residualFunctionBinding: ResidualFunctionBinding): void {
    if (!residualFunctionBinding.serializedValue) {
      let value = residualFunctionBinding.value;
      invariant(residualFunctionBinding.declarativeEnvironmentRecord);

      if (residualFunctionBinding.hasLeaked) {
        this.referentializer.referentializeLeakedBinding(residualFunctionBinding);
      } else {
        residualFunctionBinding.serializedValue =
          value !== undefined && value !== this.realm.intrinsics.__leakedValue
            ? this.serializeValue(value)
            : voidExpression;
        if (residualFunctionBinding.modified) {
          this.referentializer.referentializeModifiedBinding(residualFunctionBinding);
        }
      }

      if (value !== undefined && value.mightBeObject()) {
        // Increment ref count one more time to ensure that this object will be assigned a unique id.
        // This ensures that only once instance is created across all possible residual function invocations.
        this.residualHeapValueIdentifiers.incrementReferenceCount(value);
      }
    }
  }

  // Augments an initial set of generators with all generators from
  // which any of a given set of function values is referenced.
  _getReferencingGenerators(
    initialGenerators: Array<Generator>,
    functionValues: Array<FunctionValue>,
    referencingOnlyOptimizedFunction: void | FunctionValue
  ): Array<Generator> {
    let result = new Set(initialGenerators);
    let activeFunctions = functionValues.slice();
    let visitedFunctions = new Set();

    while (activeFunctions.length > 0) {
      let f = activeFunctions.pop();
      if (visitedFunctions.has(f)) continue;
      visitedFunctions.add(f);

      if (f === referencingOnlyOptimizedFunction) {
        let g = this.additionalFunctionGenerators.get(f);
        invariant(g !== undefined);
        result.add(g);
      } else {
        let scopes = this.residualValues.get(f);
        invariant(scopes);
        for (let scope of scopes)
          if (scope instanceof FunctionValue) {
            activeFunctions.push(scope);
          } else {
            invariant(scope instanceof Generator);
            result.add(scope);
          }
      }
    }
    return Array.from(result);
  }

  _getActiveBodyOfGenerator(generator: Generator): void | SerializedBody {
    return generator === this.generator ? this.mainBody : this.activeGeneratorBodies.get(generator);
  }

  // Determine whether initialization code for a value should go into the main body, or a more specific initialization body.
  _getTarget(
    val: Value,
    trace?: true
  ): {
    body: SerializedBody,
    usedOnlyByResidualFunctions?: true,
    optimizedFunctionRoot?: void | FunctionValue,
    commonAncestor?: Scope,
    description?: string,
  } {
    let scopes = this.residualValues.get(val);
    invariant(scopes !== undefined, "value must have been visited");

    // All relevant values were visited in at least one scope.
    invariant(scopes.size >= 1);
    if (trace) this._logScopes(scopes);

    // If a value is used in more than one scope, prevent inlining as it might be an additional root with a particular creation scope
    if (scopes.size > 1) this.residualHeapValueIdentifiers.incrementReferenceCount(val);

    // First, let's figure out from which function and generator scopes this value is referenced.
    let functionValues = [];
    let generators = [];
    for (let scope of scopes) {
      if (scope instanceof FunctionValue) {
        functionValues.push(scope);
      } else {
        invariant(scope instanceof Generator, "scope must be either function value or generator");
        generators.push(scope);
      }
    }

    let optimizedFunctionRoot = this._residualOptimizedFunctions.tryGetOptimizedFunctionRoot(val);
    if (generators.length === 0) {
      // This value is only referenced from residual functions.
      if (
        this._options.delayInitializations &&
        (optimizedFunctionRoot === undefined || !functionValues.includes(optimizedFunctionRoot))
      ) {
        // We can delay the initialization, and move it into a conditional code block in the residual functions!
        let body = this.residualFunctions.residualFunctionInitializers.registerValueOnlyReferencedByResidualFunctions(
          functionValues,
          val
        );

        return {
          body,
          usedOnlyByResidualFunctions: true,
          optimizedFunctionRoot,
          description: "delay_initializer",
        };
      }
    }

    if (trace) console.log(`  has optimized function root? ${optimizedFunctionRoot !== undefined ? "yes" : "no"}`);

    // flatten all function values into the scopes that use them
    generators = this._getReferencingGenerators(generators, functionValues, optimizedFunctionRoot);

    if (optimizedFunctionRoot === undefined) {
      // Remove all generators rooted in optimized functions,
      // since we know that there's at least one root that's not in an optimized function
      // which requires the value to be emitted outside of the optimized function.
      generators = generators.filter(generator => {
        let s = generator;
        while (s instanceof Generator) {
          s = this.generatorTree.getParent(s);
        }
        return s === "GLOBAL";
      });
      if (generators.length === 0) {
        // This means that the value was referenced by multiple optimized functions (but not by global code itself),
        // and thus it must have existed at the end of global code execution.
        // TODO: Emit to the end, not somewhere in the middle of the mainBody.

        if (trace) console.log(`  no filtered generators`);
        // TODO #2426: Revisit for nested optimized functions
        return { body: this.mainBody };
      }
    }

    const getGeneratorParent = g => {
      let s = this.generatorTree.getParent(g);
      return s instanceof Generator ? s : undefined;
    };
    // This value is referenced from more than one generator.
    // Let's find the body associated with their common ancestor.
    let commonAncestor = Array.from(generators).reduce(
      (x, y) => commonAncestorOf(x, y, getGeneratorParent),
      generators[0]
    );
    // In the case where we have no common ancestor but we have an optimized function reference,
    // we can attempt to use the generator of the single optimized function
    if (commonAncestor === undefined && optimizedFunctionRoot !== undefined) {
      commonAncestor = this.additionalFunctionGenerators.get(optimizedFunctionRoot);
    }
    invariant(commonAncestor !== undefined, "there must always be a common generator ancestor");
    if (trace) console.log(`  common ancestor: ${commonAncestor.getName()}`);

    let body;
    while (true) {
      body = this._getActiveBodyOfGenerator(commonAncestor);
      if (body !== undefined) break;
      commonAncestor = getGeneratorParent(commonAncestor);
      invariant(commonAncestor !== undefined, "there must always be an active body for the common generator ancestor");
    }

    // So we have a (common ancestor) body now.
    invariant(body !== undefined, "there must always be an active body");

    // However, there's a potential problem: That body might belong to a generator
    // which has nested generators that are currently being processed (they are not "done" yet).
    // This becomes a problem when the value for which we are trying to determine the target body
    // depends on other values which are only declared in such not-yet-done nested generator!
    // So we find all such not-yet-done bodies here, and pick a most nested one
    // which is related to one of the scopes this value is used by.
    let notYetDoneBodies = new Set();
    this.emitter.dependenciesVisitor(val, {
      onIntrinsicDerivedObject: dependency => {
        if (trace) {
          console.log(`  depending on intrinsic derived object and an identifier ${dependency.intrinsicName || "?"}`);
        }
        invariant(
          optimizedFunctionRoot === undefined || !!this.emitter.getActiveOptimizedFunction(),
          "optimized function inconsistency"
        );
        let declarationBody = this.emitter.getDeclarationBody(dependency);
        if (declarationBody !== undefined) {
          if (trace) console.log(`    has declaration body`);
          for (let b = declarationBody; b !== undefined; b = b.parentBody) {
            if (notYetDoneBodies.has(b)) break;
            notYetDoneBodies.add(b);
          }
        }
      },
      onAbstractValueWithIdentifier: dependency => {
        if (trace) console.log(`  depending on abstract value with identifier ${dependency.intrinsicName || "?"}`);
        invariant(
          optimizedFunctionRoot === undefined || !!this.emitter.getActiveOptimizedFunction(),
          "optimized function inconsistency"
        );
        let declarationBody = this.emitter.getDeclarationBody(dependency);
        if (declarationBody !== undefined) {
          if (trace) console.log(`    has declaration body`);
          for (let b = declarationBody; b !== undefined; b = b.parentBody) {
            if (notYetDoneBodies.has(b)) break;
            notYetDoneBodies.add(b);
          }
        }
      },
    });
    if (trace) console.log(`  got ${notYetDoneBodies.size} not yet done bodies`);
    for (let s of generators)
      for (let g = s; g !== undefined; g = getGeneratorParent(g)) {
        let scopeBody = this._getActiveBodyOfGenerator(g);
        if (
          scopeBody !== undefined &&
          (scopeBody.nestingLevel || 0) > (body.nestingLevel || 0) &&
          notYetDoneBodies.has(scopeBody)
        ) {
          // TODO: If there are multiple such scopeBody's, why is it okay to pick an arbitrary one?
          body = scopeBody;
          break;
        }
      }

    return { body, commonAncestor };
  }

  _getValueDebugName(val: Value): string {
    let name;
    if (val instanceof FunctionValue) {
      name = val.getName();
    } else {
      const id = this.residualHeapValueIdentifiers.getIdentifier(val);
      invariant(id);
      name = id.name;
    }
    return name;
  }

  _getResidualFunctionBinding(binding: Binding): void | ResidualFunctionBinding {
    let environment = binding.environment;
    if (environment === this.globalEnvironmentRecord.$DeclarativeRecord) environment = this.globalEnvironmentRecord;

    if (environment === this.globalEnvironmentRecord) {
      return this.globalBindings.get(binding.name);
    }

    invariant(environment instanceof DeclarativeEnvironmentRecord, "only declarative environments have bindings");
    let residualFunctionBindings = this.declarativeEnvironmentRecordsBindings.get(environment);
    if (residualFunctionBindings === undefined) return undefined;
    return residualFunctionBindings.get(binding.name);
  }

  serializeBinding(binding: Binding): BabelNodeIdentifier | BabelNodeMemberExpression {
    let residualBinding = this._getResidualFunctionBinding(binding);
    invariant(residualBinding !== undefined, "any referenced residual binding should have been visited");

    this._serializeDeclarativeEnvironmentRecordBinding(residualBinding);

    let location = residualBinding.serializedUnscopedLocation;
    invariant(location !== undefined);
    return location;
  }

  getPrelude(optimizedFunction: void | FunctionValue): Array<BabelNodeStatement> {
    if (optimizedFunction !== undefined) {
      let body = this.residualFunctions.additionalFunctionPreludes.get(optimizedFunction);
      invariant(body !== undefined);
      return body;
    } else {
      return this.prelude;
    }
  }

  _declare(
    emittingToResidualFunction: boolean,
    optimizedFunctionRoot: void | FunctionValue,
    bindingType: BabelVariableKind,
    id: BabelNodeLVal,
    init: BabelNodeExpression
  ): void {
    if (emittingToResidualFunction) {
      let declar = t.variableDeclaration(bindingType, [t.variableDeclarator(id)]);
      this.getPrelude(optimizedFunctionRoot).push(declar);
      let assignment = t.expressionStatement(t.assignmentExpression("=", id, init));
      this.emitter.emit(assignment);
    } else {
      let declar = t.variableDeclaration(bindingType, [t.variableDeclarator(id, init)]);
      this.emitter.emit(declar);
    }
  }

  serializeValue(val: Value, referenceOnly?: boolean, bindingType?: BabelVariableKind): BabelNodeExpression {
    invariant(!(val instanceof ObjectValue && val.refuseSerialization));
    if (val instanceof AbstractValue) {
      if (val.kind === "widened") {
        this.serializedValues.add(val);
        let name = val.intrinsicName;
        invariant(name !== undefined);
        return t.identifier(name);
      } else if (val.kind === "widened property") {
        this.serializedValues.add(val);
        return this._serializeAbstractValueHelper(val);
      }
    }

    // make sure we're not serializing a class method here
    if (val instanceof ECMAScriptSourceFunctionValue && this.residualClassMethodInstances.has(val)) {
      let classMethodInstance = this.residualClassMethodInstances.get(val);
      invariant(classMethodInstance);
      // anything other than a class constructor should never go through serializeValue()
      // so we need to log a nice error message to the user
      if (classMethodInstance.methodType !== "constructor") {
        let error = new CompilerDiagnostic(
          "a class method incorrectly went through the serializeValue() code path",
          val.$ECMAScriptCode.loc,
          "PP0022",
          "FatalError"
        );
        this.realm.handleError(error);
        throw new FatalError();
      }
    }

    if (this._serializedValueWithIdentifiers.has(val)) {
      return this.getSerializeObjectIdentifier(val);
    }

    this.serializedValues.add(val);
    if (!referenceOnly && HeapInspector.isLeaf(val)) {
      let res = this._serializeValue(val);
      invariant(res !== undefined);
      return res;
    }
    this._serializedValueWithIdentifiers.add(val);

    let target = this._getTarget(val);
    let oldBody = this.emitter.beginEmitting(val, target.body);
    let init = this._serializeValue(val);

    let id = this.residualHeapValueIdentifiers.getIdentifier(val);
    if (this._options.debugIdentifiers !== undefined && this._options.debugIdentifiers.includes(id.name)) {
      console.log(`Tracing value with identifier ${id.name} (${val.constructor.name}) targetting ${target.body.type}`);
      this._getTarget(val, true);
    }
    let result = id;
    this.residualHeapValueIdentifiers.incrementReferenceCount(val);

    if (this.residualHeapValueIdentifiers.needsIdentifier(val)) {
      if (init) {
        if (this._options.debugScopes) {
          let scopes = this.residualValues.get(val);
          invariant(scopes !== undefined);
          const scopeList = Array.from(scopes)
            .map(s => `"${s.getName()}"`)
            .join(",");
          let comment = `${this._getValueDebugName(val)} referenced from scopes [${scopeList}]`;
          if (target.commonAncestor !== undefined)
            comment = `${comment} with common ancestor: ${target.commonAncestor.getName()}`;
          if (target.description !== undefined) comment = `${comment} => ${target.description} `;
          this.emitter.emit(commentStatement(comment));
        }
        if (init !== id) {
          this._declare(
            !!target.usedOnlyByResidualFunctions,
            target.optimizedFunctionRoot,
            bindingType || "var",
            id,
            init
          );
        }
        this.getStatistics().valueIds++;
        if (target.usedOnlyByResidualFunctions) this.getStatistics().delayedValues++;
      }
    } else {
      if (init) {
        this.residualHeapValueIdentifiers.deleteIdentifier(val);
        result = init;
        this.getStatistics().valuesInlined++;
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
      invariant(
        this.emitter.getBody().type === "MainGenerator" ||
          this.emitter.getBody().type === "OptimizedFunction" ||
          this.emitter.getBody().type === "DelayInitializations"
      );
      return this.preludeGenerator.memoizeReference(intrinsicName);
    }
  }

  _getDescriptorValues(desc: void | Descriptor): Array<Value> {
    if (desc === undefined) {
      return [];
    } else if (desc instanceof PropertyDescriptor) {
      invariant(desc.value === undefined || desc.value instanceof Value);
      if (desc.value !== undefined) return [desc.value];
      invariant(desc.get !== undefined);
      invariant(desc.set !== undefined);
      return [desc.get, desc.set];
    } else if (desc instanceof AbstractJoinedDescriptor) {
      return [
        desc.joinCondition,
        ...this._getDescriptorValues(desc.descriptor1),
        ...this._getDescriptorValues(desc.descriptor2),
      ];
    } else {
      invariant(false, "unknown descriptor");
    }
  }

  _deleteProperty(location: BabelNodeLVal): void {
    invariant(location.type === "MemberExpression");
    this.emitter.emit(
      t.expressionStatement(t.unaryExpression("delete", ((location: any): BabelNodeMemberExpression), true))
    );
  }

  _assignProperty(
    location: BabelNodeLVal,
    value: Value,
    mightHaveBeenDeleted: boolean,
    deleteIfMightHaveBeenDeleted: boolean = false
  ): void {
    this.emitter.emit(
      this._getPropertyAssignmentStatement(location, value, mightHaveBeenDeleted, deleteIfMightHaveBeenDeleted)
    );
  }

  _getPropertyAssignmentStatement(
    location: BabelNodeLVal,
    value: Value,
    mightHaveBeenDeleted: boolean,
    deleteIfMightHaveBeenDeleted: boolean = false
  ): BabelNodeStatement {
    if (mightHaveBeenDeleted) {
      invariant(value.mightHaveBeenDeleted());

      // We always need to serialize this value in order to keep the invariants happy,
      // as the visitor hasn't been taught about the following peephole optimization.
      let serializedValue = this.serializeValue(value);

      // Let's find the relevant value taking into account conditions implied by path conditions
      while (value instanceof AbstractValue && value.kind === "conditional") {
        let cf = this.conditionalFeasibility.get(value);
        invariant(cf !== undefined);
        if (cf.t && cf.f) break;
        if (cf.t) value = value.args[1];
        else {
          invariant(cf.f);
          value = value.args[2];
        }
      }
      if (value instanceof EmptyValue) {
        return t.expressionStatement(t.unaryExpression("delete", ((location: any): BabelNodeMemberExpression), true));
      } else if (value.mightHaveBeenDeleted()) {
        // Let's try for a little peephole optimization, if __empty is a branch of a conditional, and the other side cannot be __empty
        let condition;
        if (value instanceof AbstractValue && value.kind === "conditional") {
          let [c, x, y] = value.args;
          if (x instanceof EmptyValue && !y.mightHaveBeenDeleted()) {
            if (c instanceof AbstractValue && c.kind === "!") condition = this.serializeValue(c.args[0]);
            else condition = t.unaryExpression("!", this.serializeValue(c));
            serializedValue = this.serializeValue(y);
          } else if (y instanceof EmptyValue && !x.mightHaveBeenDeleted()) {
            condition = this.serializeValue(c);
            serializedValue = this.serializeValue(x);
          }
        }
        if (condition === undefined) {
          condition = t.binaryExpression("!==", serializedValue, this._serializeEmptyValue());
        }
        let assignment = t.expressionStatement(t.assignmentExpression("=", location, serializedValue));
        let deletion = null;
        if (deleteIfMightHaveBeenDeleted) {
          invariant(location.type === "MemberExpression");
          deletion = t.expressionStatement(
            t.unaryExpression("delete", ((location: any): BabelNodeMemberExpression), true)
          );
        }
        return t.ifStatement(condition, assignment, deletion);
      }
    }

    return t.expressionStatement(t.assignmentExpression("=", location, this.serializeValue(value)));
  }

  _serializeArrayIndexProperties(
    array: ObjectValue,
    indexPropertyLength: number,
    remainingProperties: Map<string, PropertyBinding>
  ): Array<null | BabelNodeExpression | BabelNodeSpreadElement> {
    let elems = [];
    for (let i = 0; i < indexPropertyLength; i++) {
      let key = i + "";
      let propertyBinding = remainingProperties.get(key);
      let elem = null;
      // "propertyBinding === undefined" means array has a hole in the middle.
      if (propertyBinding !== undefined) {
        let descriptor = propertyBinding.descriptor;
        // "descriptor === undefined" means this array item has been deleted.
        invariant(descriptor === undefined || descriptor instanceof PropertyDescriptor);
        if (
          descriptor !== undefined &&
          descriptor.value !== undefined &&
          this._canEmbedProperty(array, key, descriptor)
        ) {
          let elemVal = descriptor.value;
          invariant(elemVal instanceof Value);
          let mightHaveBeenDeleted = elemVal.mightHaveBeenDeleted();
          let instantRenderMode = this.realm.instantRender.enabled;

          let delayReason;
          /* In Instant Render mode, deleted indices are initialized
          to the __empty built-in */
          if (instantRenderMode) {
            if (this.emitter.getReasonToWaitForDependencies(elemVal)) {
              this.realm.instantRenderBailout(
                "InstantRender does not yet support cyclical arrays or objects",
                array.expressionLocation
              );
            }
            delayReason = undefined;
          } else {
            delayReason =
              this.emitter.getReasonToWaitForDependencies(elemVal) ||
              this.emitter.getReasonToWaitForActiveValue(array, mightHaveBeenDeleted);
          }
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
    let lenProperty;
    if (val.mightBeLeakedObject()) {
      lenProperty = this.realm.evaluateWithoutLeakLogic(() => Get(realm, val, "length"));
    } else {
      lenProperty = Get(realm, val, "length");
    }
    // Need to serialize length property if:
    // 1. array length is abstract.
    // 2. array length is concrete, but different from number of index properties
    //  we put into initialization list.
    if (lenProperty instanceof AbstractValue || To.ToLength(realm, lenProperty) !== numberOfIndexProperties) {
      if (!(lenProperty instanceof AbstractValue) || lenProperty.kind !== "widened property") {
        let semaphore = this._acquireOneObjectSemaphore(val);
        this.emitter.emitNowOrAfterWaitingForDependencies(
          [val, lenProperty],
          () => {
            this._assignProperty(
              t.memberExpression(this.getSerializeObjectIdentifier(val), t.identifier("length")),
              lenProperty,
              false /*mightHaveBeenDeleted*/
            );
            if (semaphore !== undefined) semaphore.releaseOne();
          },
          this.emitter.getBody()
        );
      }
      remainingProperties.delete("length");
    }
  }

  _serializeValueArray(val: ObjectValue): BabelNodeExpression {
    let remainingProperties = new Map(val.properties);

    let [unconditionalLength, assignmentNotNeeded] = getSuggestedArrayLiteralLength(this.realm, val);
    // Use the unconditional serialized index properties as array initialization list.
    const initProperties = this._serializeArrayIndexProperties(val, unconditionalLength, remainingProperties);
    if (!assignmentNotNeeded) this._serializeArrayLengthIfNeeded(val, unconditionalLength, remainingProperties);
    this._emitObjectProperties(val, remainingProperties);
    return t.arrayExpression(initProperties);
  }

  _serializeValueMap(val: ObjectValue): BabelNodeExpression {
    let kind = val.getKind();
    let elems = [];

    let entries;
    let omitDeadEntries;

    if (kind === "Map") {
      entries = val.$MapData;
      omitDeadEntries = false;
    } else {
      invariant(kind === "WeakMap");
      entries = val.$WeakMapData;
      omitDeadEntries = true;
    }
    invariant(entries !== undefined);
    let len = entries.length;
    let mapConstructorDoesntTakeArguments = this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION);

    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      let key = entry.$Key;
      let value = entry.$Value;
      if (key === undefined || value === undefined || (omitDeadEntries && !this.residualValues.has(key))) continue;
      let mightHaveBeenDeleted = key.mightHaveBeenDeleted();
      let delayReason =
        this.emitter.getReasonToWaitForDependencies(key) ||
        this.emitter.getReasonToWaitForDependencies(value) ||
        this.emitter.getReasonToWaitForActiveValue(val, mightHaveBeenDeleted || mapConstructorDoesntTakeArguments);
      if (delayReason) {
        this.emitter.emitAfterWaiting(
          delayReason,
          [key, value, val],
          () => {
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
          },
          this.emitter.getBody()
        );
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
    let omitDeadEntries;

    if (kind === "Set") {
      entries = val.$SetData;
      omitDeadEntries = false;
    } else {
      invariant(kind === "WeakSet");
      entries = val.$WeakSetData;
      omitDeadEntries = true;
    }

    invariant(entries !== undefined);
    let len = entries.length;
    let setConstructorDoesntTakeArguments = this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION);

    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      if (entry === undefined || (omitDeadEntries && !this.residualValues.has(entry))) continue;
      let mightHaveBeenDeleted = entry.mightHaveBeenDeleted();
      let delayReason =
        this.emitter.getReasonToWaitForDependencies(entry) ||
        this.emitter.getReasonToWaitForActiveValue(val, mightHaveBeenDeleted || setConstructorDoesntTakeArguments);
      if (delayReason) {
        this.emitter.emitAfterWaiting(
          delayReason,
          [entry, val],
          () => {
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
          },
          this.emitter.getBody()
        );
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
    invariant(instance !== undefined);
    let residualBindings = instance.residualFunctionBindings;

    let inOptimizedFunction = this._residualOptimizedFunctions.tryGetOptimizedFunctionRoot(val);
    if (inOptimizedFunction !== undefined) instance.containingAdditionalFunction = inOptimizedFunction;
    let bindingsEmittedSemaphore = new CountingSemaphore(() => {
      invariant(instance);
      // hoist if we are in an additionalFunction
      if (inOptimizedFunction !== undefined && canHoistFunction(this.realm, val, undefined, new Set())) {
        instance.insertionPoint = new BodyReference(this.mainBody, this.mainBody.entries.length);
        instance.containingAdditionalFunction = undefined;
      } else {
        instance.insertionPoint = this.emitter.getBodyReference();
      }
    });

    for (let [boundName, residualBinding] of residualBindings) {
      let referencedValues = [];
      let serializeBindingFunc;
      if (!residualBinding.declarativeEnvironmentRecord) {
        serializeBindingFunc = () => this._serializeGlobalBinding(boundName, residualBinding);
      } else {
        serializeBindingFunc = () => this._serializeDeclarativeEnvironmentRecordBinding(residualBinding);
        if (residualBinding.value !== undefined) referencedValues.push(residualBinding.value);
      }
      bindingsEmittedSemaphore.acquireOne();
      this.emitter.emitNowOrAfterWaitingForDependencies(
        referencedValues,
        () => {
          serializeBindingFunc();
          bindingsEmittedSemaphore.releaseOne();
        },
        this.emitter.getBody()
      );
    }
    if (val.$FunctionKind === "classConstructor") {
      let homeObject = val.$HomeObject;
      if (homeObject instanceof ObjectValue && homeObject.$IsClassPrototype) {
        this._serializeClass(val, homeObject, bindingsEmittedSemaphore);
        return;
      }
    }
    bindingsEmittedSemaphore.releaseOne();
    this._emitObjectProperties(val);
    let additionalEffects = this.additionalFunctionValuesAndEffects.get(val);
    if (additionalEffects) this._serializeAdditionalFunction(val, additionalEffects);
  }

  _serializeClass(
    classFunc: ECMAScriptSourceFunctionValue,
    classPrototype: ObjectValue,
    bindingsEmittedSemaphore: CountingSemaphore
  ): void {
    let classMethodInstance = this.residualClassMethodInstances.get(classFunc);

    invariant(classMethodInstance !== undefined);

    let classProtoId;
    let hasSerializedClassProtoId = false;
    let propertiesToSerialize = new Map();

    // handle class inheritance
    if (!(classFunc.$Prototype instanceof NativeFunctionValue)) {
      classMethodInstance.classSuperNode = this.serializeValue(classFunc.$Prototype);
    }

    let serializeClassPrototypeId = () => {
      if (!hasSerializedClassProtoId) {
        let classId = this.getSerializeObjectIdentifier(classFunc);
        classProtoId = t.identifier(this.intrinsicNameGenerator.generate());
        hasSerializedClassProtoId = true;
        this.emitter.emit(
          t.variableDeclaration("var", [
            t.variableDeclarator(classProtoId, t.memberExpression(classId, t.identifier("prototype"))),
          ])
        );
      }
    };

    let serializeClassMethodOrProperty = (propertyNameOrSymbol, methodFuncOrProperty) => {
      const serializeNameAndId = () => {
        let methodFuncOrPropertyId = this.serializeValue(methodFuncOrProperty);
        let name;

        if (typeof propertyNameOrSymbol === "string") {
          name = t.identifier(propertyNameOrSymbol);
        } else {
          name = this.serializeValue(propertyNameOrSymbol);
        }
        return { name, methodFuncOrPropertyId };
      };

      if (methodFuncOrProperty instanceof ECMAScriptSourceFunctionValue) {
        if (methodFuncOrProperty !== classFunc) {
          // if the method does not have a $HomeObject, it's not a class method
          if (methodFuncOrProperty.$HomeObject !== undefined) {
            this.serializedValues.add(methodFuncOrProperty);
            this._serializeClassMethod(propertyNameOrSymbol, methodFuncOrProperty);
          } else {
            // if the method is not part of the class, we have to assign it to the prototype
            // we can't serialize via emitting the properties as that will emit all
            // the prototype and we only want to mutate the prototype here
            serializeClassPrototypeId();
            invariant(classProtoId !== undefined);
            let { name, methodFuncOrPropertyId } = serializeNameAndId();
            this.emitter.emit(
              t.expressionStatement(
                t.assignmentExpression("=", t.memberExpression(classProtoId, name), methodFuncOrPropertyId)
              )
            );
          }
        }
      } else {
        let prototypeId = t.memberExpression(this.getSerializeObjectIdentifier(classFunc), t.identifier("prototype"));
        let { name, methodFuncOrPropertyId } = serializeNameAndId();
        this.emitter.emit(
          t.expressionStatement(
            t.assignmentExpression("=", t.memberExpression(prototypeId, name), methodFuncOrPropertyId)
          )
        );
      }
    };

    let serializeClassProperty = (propertyNameOrSymbol, propertyValue) => {
      // we handle the prototype via class syntax
      if (propertyNameOrSymbol === "prototype") {
        this.serializedValues.add(propertyValue);
      } else if (propertyValue instanceof ECMAScriptSourceFunctionValue && propertyValue.$HomeObject === classFunc) {
        serializeClassMethodOrProperty(propertyNameOrSymbol, propertyValue);
      } else {
        let prop = classFunc.properties.get(propertyNameOrSymbol);
        invariant(prop);
        propertiesToSerialize.set(propertyNameOrSymbol, prop);
      }
    };

    // find the all the properties on the class that we need to serialize
    for (let [propertyName, method] of classFunc.properties) {
      if (
        !this.residualHeapInspector.canIgnoreProperty(classFunc, propertyName) &&
        !ClassPropertiesToIgnore.has(propertyName) &&
        method.descriptor !== undefined &&
        !(propertyName === "length" && canIgnoreClassLengthProperty(classFunc, method.descriptor, this.logger))
      ) {
        withDescriptorValue(propertyName, method.descriptor, serializeClassProperty);
      }
    }
    // pass in the properties and set it so we don't serialize the prototype
    bindingsEmittedSemaphore.releaseOne();
    this._emitObjectProperties(classFunc, propertiesToSerialize, undefined, undefined, true);

    // handle non-symbol properties
    for (let [propertyName, method] of classPrototype.properties) {
      withDescriptorValue(propertyName, method.descriptor, serializeClassMethodOrProperty);
    }
    // handle symbol properties
    for (let [symbol, method] of classPrototype.symbols) {
      withDescriptorValue(symbol, method.descriptor, serializeClassMethodOrProperty);
    }
    // assign the AST method key node for the "constructor"
    classMethodInstance.classMethodKeyNode = t.identifier("constructor");
  }

  _serializeClassMethod(key: string | SymbolValue, methodFunc: ECMAScriptSourceFunctionValue): void {
    let classMethodInstance = this.residualClassMethodInstances.get(methodFunc);

    invariant(classMethodInstance !== undefined);
    if (typeof key === "string") {
      classMethodInstance.classMethodKeyNode = t.identifier(key);
      // as we know the method name is a string again, we can remove the computed status
      classMethodInstance.classMethodComputed = false;
    } else if (key instanceof SymbolValue) {
      classMethodInstance.classMethodKeyNode = this.serializeValue(key);
    } else {
      invariant(false, "Unknown method key type");
    }
    this._serializeValueFunction(methodFunc);
  }

  // Checks whether a property can be defined via simple assignment, or using object literal syntax.
  _canEmbedProperty(obj: ObjectValue, key: string | SymbolValue | AbstractValue, prop: Descriptor): boolean {
    if (!(prop instanceof PropertyDescriptor)) return false;

    let targetDescriptor = this.residualHeapInspector.getTargetIntegrityDescriptor(obj);

    if ((obj instanceof FunctionValue && key === "prototype") || (obj.getKind() === "RegExp" && key === "lastIndex"))
      return (
        prop.writable === targetDescriptor.writable && !prop.configurable && !prop.enumerable && !prop.set && !prop.get
      );
    else if (
      prop.writable === targetDescriptor.writable &&
      prop.configurable === targetDescriptor.configurable &&
      !!prop.enumerable &&
      !prop.set &&
      !prop.get
    ) {
      return !(prop.value instanceof AbstractValue && prop.value.kind === "widened property");
    } else {
      return false;
    }
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
  serializeValueRawObject(
    val: ObjectValue,
    skipPrototype: boolean,
    emitIntegrityCommand: void | (SerializedBody => void)
  ): BabelNodeExpression {
    let remainingProperties = new Map(val.properties);
    const dummyProperties = new Set();
    let props = [];
    let isCertainlyLeaked = !val.mightNotBeLeakedObject();

    // TODO #2259: Make deduplication in the face of leaking work for custom accessors
    let shouldDropAsAssignedProp = (descriptor: Descriptor | void) =>
      isCertainlyLeaked &&
      (descriptor instanceof PropertyDescriptor && (descriptor.get === undefined && descriptor.set === undefined));

    if (val.temporalAlias !== undefined) {
      return t.objectExpression(props);
    } else {
      for (let [key, propertyBinding] of val.properties) {
        if (propertyBinding.descriptor !== undefined && shouldDropAsAssignedProp(propertyBinding.descriptor)) {
          remainingProperties.delete(key);
          continue;
        }

        if (propertyBinding.pathNode !== undefined) continue; // written to inside loop
        let descriptor = propertyBinding.descriptor;
        if (descriptor === undefined || !(descriptor instanceof PropertyDescriptor) || descriptor.value === undefined)
          continue; // deleted

        let serializedKey = getAsPropertyNameExpression(key);
        if (this._canEmbedProperty(val, key, descriptor)) {
          let propValue = descriptor.value;
          invariant(propValue instanceof Value);
          if (this.residualHeapInspector.canIgnoreProperty(val, key)) continue;
          let mightHaveBeenDeleted = propValue.mightHaveBeenDeleted();

          let instantRenderMode = this.realm.instantRender.enabled;

          let delayReason;
          if (instantRenderMode) {
            if (this.emitter.getReasonToWaitForDependencies(propValue)) {
              this.realm.instantRenderBailout(
                "InstantRender does not yet support cyclical arrays or objects",
                val.expressionLocation
              );
            }
            delayReason = undefined;
          } else {
            delayReason =
              this.emitter.getReasonToWaitForDependencies(propValue) ||
              this.emitter.getReasonToWaitForActiveValue(val, mightHaveBeenDeleted);
          }

          // Although the property needs to be delayed, we still want to emit dummy "undefined"
          // value as part of the object literal to ensure a consistent property ordering.
          let serializedValue = !instantRenderMode ? voidExpression : emptyExpression;
          if (delayReason) {
            // May need to be cleaned up later.
            dummyProperties.add(key);
          } else {
            remainingProperties.delete(key);
            serializedValue = this.serializeValue(propValue);
          }
          props.push(t.objectProperty(serializedKey, serializedValue));
        } else if (descriptor.value instanceof Value && descriptor.value.mightHaveBeenDeleted()) {
          dummyProperties.add(key);
          props.push(t.objectProperty(serializedKey, voidExpression));
        }
      }
    }

    this._emitObjectProperties(
      val,
      remainingProperties,
      /*objectPrototypeAlreadyEstablished*/ false,
      dummyProperties,
      skipPrototype
    );

    return t.objectExpression(props);
  }

  _serializeValueObjectViaConstructor(
    val: ObjectValue,
    skipPrototype: boolean,
    classConstructor?: Value
  ): BabelNodeExpression {
    let proto = val.$Prototype;
    this._emitObjectProperties(
      val,
      val.properties,
      /*objectPrototypeAlreadyEstablished*/ true,
      undefined,
      skipPrototype
    );
    let serializedProto = this.serializeValue(classConstructor ? classConstructor : proto);
    if (val.temporalAlias === undefined) {
      this.needsAuxiliaryConstructor = true;
      return t.sequenceExpression([
        t.assignmentExpression(
          "=",
          t.memberExpression(constructorExpression, t.identifier("prototype")),
          classConstructor ? t.memberExpression(serializedProto, t.identifier("prototype")) : serializedProto
        ),
        t.newExpression(constructorExpression, []),
      ]);
    } else {
      this.emitter.emitAfterWaiting(
        val.temporalAlias,
        [],
        () => {
          invariant(val.temporalAlias !== undefined);
          let uid = this.serializeValue(val.temporalAlias);
          this.emitter.emit(
            t.expressionStatement(
              t.callExpression(this.preludeGenerator.memoizeReference("Object.setPrototypeOf"), [uid, serializedProto])
            )
          );
        },
        this.emitter.getBody()
      );
      return t.objectExpression([]);
    }
  }

  serializeValueObject(
    val: ObjectValue,
    emitIntegrityCommand: void | (SerializedBody => void)
  ): BabelNodeExpression | void {
    // If this object is a prototype object that was implicitly created by the runtime
    // for a constructor, then we can obtain a reference to this object
    // in a special way that's handled alongside function serialization.
    let constructor = val.originalConstructor;
    if (constructor !== undefined) {
      let prototypeId = this.residualHeapValueIdentifiers.getIdentifier(val);
      this.emitter.emitNowOrAfterWaitingForDependencies(
        [constructor],
        () => {
          invariant(constructor !== undefined);
          invariant(prototypeId !== undefined);
          this.serializeValue(constructor);
          this._emitObjectProperties(val);
          invariant(prototypeId.type === "Identifier");
          this.residualFunctions.setFunctionPrototype(constructor, prototypeId);
        },
        this.emitter.getBody()
      );
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
        this.residualReactElementSerializer.serializeReactElement(val);
        return;
      case "Map":
      case "WeakMap":
        return this._serializeValueMap(val);
      case "Set":
      case "WeakSet":
        return this._serializeValueSet(val);
      default:
        invariant(kind === "Object", "invariant established by visitor");

        let proto = val.$Prototype;
        let { skipPrototype, constructor: _constructor } = getObjectPrototypeMetadata(this.realm, val);
        let createViaAuxiliaryConstructor =
          val.temporalAlias === undefined &&
          proto !== this.realm.intrinsics.ObjectPrototype &&
          this._findLastObjectPrototype(val) === this.realm.intrinsics.ObjectPrototype &&
          proto instanceof ObjectValue &&
          !skipPrototype;

        return createViaAuxiliaryConstructor || _constructor
          ? this._serializeValueObjectViaConstructor(val, skipPrototype, _constructor)
          : this.serializeValueRawObject(val, skipPrototype, emitIntegrityCommand);
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
    if (val.kind === "abstractConcreteUnion") {
      invariant(val.args.length >= 2);
      invariant(val.args[0] instanceof AbstractValue);
      return serializedArgs[0];
    }
    if (val.kind === "explicit conversion to object") {
      let ob = serializedArgs[0];
      invariant(ob !== undefined);
      return t.callExpression(this.preludeGenerator.memoizeReference("Object.assign"), [ob]);
    } else if (val.kind === "template for prototype member expression") {
      let obj = this.serializeValue(val.args[0]);
      let prop = this.serializeValue(val.args[1]);
      return t.memberExpression(obj, prop, true);
    }
    invariant(val.operationDescriptor !== undefined);
    let serializedValue = this.residualOperationSerializer.serializeExpression(val.operationDescriptor, serializedArgs);
    if (serializedValue.type === "Identifier") {
      let id = ((serializedValue: any): BabelNodeIdentifier);
      invariant(
        !this.realm.derivedIds.has(id.name) ||
          this.emitter.cannotDeclare() ||
          this.emitter.hasBeenDeclared(val) ||
          !!this.emitter.getActiveOptimizedFunction(),
        `an abstract value with an identifier "${id.name}" was referenced before being declared`
      );
    }
    return serializedValue;
  }

  _serializeAbstractValue(val: AbstractValue): void | BabelNodeExpression {
    invariant(val.kind !== "sentinel member expression", "invariant established by visitor");
    if (val.kind === "conditional") {
      let cf = this.conditionalFeasibility.get(val);
      invariant(cf !== undefined);
      if (cf.t && !cf.f) return this.serializeValue(val.args[1]);
      else if (!cf.t && cf.f) return this.serializeValue(val.args[2]);
      else invariant(cf.t && cf.f);
    }
    if (val.hasIdentifier()) {
      return this._serializeAbstractValueHelper(val);
    } else {
      // This abstract value's dependencies should all be declared
      // but still need to check them again in case their serialized bodies are in different generator scope.
      let reason = this.emitter.getReasonToWaitForDependencies(val.args);
      if (reason === undefined) {
        return this._serializeAbstractValueHelper(val);
      } else {
        this.emitter.emitAfterWaiting(
          reason,
          val.args,
          () => {
            const serializedValue = this._serializeAbstractValueHelper(val);
            let uid = this.getSerializeObjectIdentifier(val);
            this._declare(this.emitter.cannotDeclare(), undefined, "var", uid, serializedValue);
          },
          this.emitter.getBody()
        );
      }
    }
  }

  _serializeEmptyValue(): BabelNodeExpression {
    this.needsEmptyVar = !this.realm.instantRender.enabled;
    return emptyExpression;
  }

  _serializeValue(val: Value): void | BabelNodeExpression {
    if (val instanceof AbstractValue) {
      return this._serializeAbstractValue(val);
    } else if (val.isIntrinsic()) {
      return this._serializeValueIntrinsic(val);
    } else if (val instanceof EmptyValue) {
      return this._serializeEmptyValue();
    } else if (val instanceof UndefinedValue) {
      return voidExpression;
    } else if (HeapInspector.isLeaf(val)) {
      return t.valueToNode(val.serialize());
    } else if (val instanceof ObjectValue) {
      return this._serializeValueObjectBase(val);
    } else {
      invariant(val instanceof SymbolValue);
      return this._serializeValueSymbol(val);
    }
  }

  _serializeValueObjectBase(obj: ObjectValue): void | BabelNodeExpression {
    if (obj instanceof ProxyValue) {
      return this._serializeValueProxy(obj);
    }

    let objectSemaphore;
    let targetCommand = this.residualHeapInspector.getTargetIntegrityCommand(obj);
    let emitIntegrityCommand;
    if (targetCommand) {
      let body = this.emitter.getBody();
      objectSemaphore = new CountingSemaphore(() => {
        this.emitter.emitNowOrAfterWaitingForDependencies(
          [obj],
          () => {
            let uid = this.getSerializeObjectIdentifier(obj);
            this.emitter.emit(
              t.expressionStatement(
                t.callExpression(this.preludeGenerator.memoizeReference("Object." + targetCommand), [uid])
              )
            );
          },
          body
        );
      });
      this._objectSemaphores.set(obj, objectSemaphore);
      emitIntegrityCommand = alternateBody => {
        if (objectSemaphore !== undefined) {
          if (alternateBody !== undefined) body = alternateBody;
          objectSemaphore.releaseOne();
          this._objectSemaphores.delete(obj);
        }
        objectSemaphore = undefined;
      };
    }
    let res;
    if (IsArray(this.realm, obj)) {
      res = this._serializeValueArray(obj);
    } else if (obj instanceof FunctionValue) {
      res = this._serializeValueFunction(obj);
    } else {
      res = this.serializeValueObject(obj, emitIntegrityCommand);
    }
    if (emitIntegrityCommand !== undefined) emitIntegrityCommand();
    return res;
  }

  _serializeGlobalBinding(boundName: string, binding: ResidualFunctionBinding): void {
    invariant(!binding.declarativeEnvironmentRecord);
    if (!binding.serializedValue) {
      binding.referentialized = true;
      if (boundName === "undefined") {
        binding.serializedValue = voidExpression;
      } else if (binding.value !== undefined) {
        binding.serializedValue = t.identifier(boundName);
        invariant(binding.value !== undefined);
        this.declaredGlobalLets.set(boundName, binding.value);
      }
    }
  }

  _annotateGeneratorStatements(generator: Generator, statements: Array<BabelNodeStatement>): void {
    let comment = `generator "${generator.getName()}"`;
    let parent = this.generatorTree.getParent(generator);
    if (parent instanceof Generator) {
      comment = `${comment} with parent "${parent.getName()}"`;
    } else if (parent instanceof FunctionValue) {
      comment = `${comment} with function parent`;
    } else {
      invariant(parent === "GLOBAL");
      comment = `${comment} with global parent`;
    }
    let beginComments = [commentStatement("begin " + comment)];
    let effects = generator.effectsToApply;
    if (effects) {
      let valueToString = value =>
        this.residualHeapValueIdentifiers.hasIdentifier(value)
          ? this.residualHeapValueIdentifiers.getIdentifier(value).name
          : "?";
      let keyToString = key => (typeof key === "string" ? key : key instanceof Value ? valueToString(key) : "?");

      beginComments.push(
        commentStatement(
          `  has effects: ${effects.createdObjects.size} created objects, ${
            effects.modifiedBindings.size
          } modified bindings, ${effects.modifiedProperties.size} modified properties`
        )
      );
      if (effects.createdObjects.size > 0)
        beginComments.push(
          commentStatement(
            `    created objects: ${Array.from(effects.createdObjects)
              .map(valueToString)
              .join(", ")}`
          )
        );
      if (effects.modifiedBindings.size > 0)
        beginComments.push(
          commentStatement(
            `    modified bindings: ${Array.from(effects.modifiedBindings.keys())
              .map(b => b.name)
              .join(", ")}`
          )
        );
      if (effects.modifiedProperties.size > 0)
        beginComments.push(
          commentStatement(
            `    modified properties: ${Array.from(effects.modifiedProperties.keys())
              .map(b => `${valueToString(b.object)}.${keyToString(b.key)}`)
              .join(", ")}`
          )
        );
    }
    statements.unshift(...beginComments);
    statements.push(commentStatement("end " + comment));
  }

  _withGeneratorScope(
    type: "Generator" | "OptimizedFunction",
    generator: Generator,
    valuesToProcess: void | Set<AbstractValue | ObjectValue>,
    callback: SerializedBody => void,
    optimizedFunction?: void | FunctionValue
  ): Array<BabelNodeStatement> {
    let newBody = { type, parentBody: undefined, entries: [], done: false, optimizedFunction };
    let optimizedFunctionRoot =
      optimizedFunction === undefined
        ? undefined
        : this._residualOptimizedFunctions.tryGetOptimizedFunctionRoot(optimizedFunction);
    let isChild = !!optimizedFunctionRoot || type === "Generator";
    let oldBody = this.emitter.beginEmitting(generator, newBody, /*isChild*/ isChild);
    invariant(!this.activeGeneratorBodies.has(generator));
    this.activeGeneratorBodies.set(generator, newBody);
    callback(newBody);
    invariant(this.activeGeneratorBodies.has(generator));
    this.activeGeneratorBodies.delete(generator);
    const statements = this.emitter.endEmitting(generator, oldBody, valuesToProcess, /*isChild*/ isChild).entries;
    if (this._options.debugScopes) this._annotateGeneratorStatements(generator, statements);
    this.getStatistics().generators++;
    return statements;
  }

  _getContext(): SerializationContext {
    let context = {
      serializeOperationDescriptor: this.residualOperationSerializer.serializeStatement.bind(
        this.residualOperationSerializer
      ),
      serializeBinding: this.serializeBinding.bind(this),
      serializeBindingAssignment: (binding: Binding, bindingValue: Value) => {
        let serializeBinding = this.serializeBinding(binding);
        let serializedValue = context.serializeValue(bindingValue);
        return t.expressionStatement(t.assignmentExpression("=", serializeBinding, serializedValue));
      },
      serializeCondition: (
        condition: Value,
        consequentGenerator: Generator,
        alternateGenerator: Generator,
        valuesToProcess: Set<AbstractValue | ObjectValue>
      ) => {
        let serializedCondition = this.serializeValue(condition);
        let consequentBody = context.serializeGenerator(consequentGenerator, valuesToProcess);
        let alternateBody = context.serializeGenerator(alternateGenerator, valuesToProcess);
        return t.ifStatement(serializedCondition, t.blockStatement(consequentBody), t.blockStatement(alternateBody));
      },
      serializeDebugScopeComment(declared: ObjectValue | AbstractValue) {
        let s = t.emptyStatement();
        s.leadingComments = [({ type: "BlockComment", value: `declaring ${declared.intrinsicName || "?"}` }: any)];
        return s;
      },
      serializeReturnValue: (val: Value) => {
        return t.returnStatement(this.serializeValue(val));
      },
      serializeGenerator: (
        generator: Generator,
        valuesToProcess: Set<AbstractValue | ObjectValue>
      ): Array<BabelNodeStatement> =>
        this._withGeneratorScope("Generator", generator, valuesToProcess, () =>
          generator.serialize(((context: any): SerializationContext))
        ),
      serializeValue: this.serializeValue.bind(this),
      initGenerator: (generator: Generator) => {
        let activeGeneratorBody = this._getActiveBodyOfGenerator(generator);
        invariant(activeGeneratorBody === this.emitter.getBody(), "generator to init must be current emitter body");
        let s = this.additionalGeneratorRoots.get(generator);
        if (s !== undefined) for (let value of s) this.serializeValue(value);
      },
      finalizeGenerator: (generator: Generator) => {
        let activeGeneratorBody = this._getActiveBodyOfGenerator(generator);
        invariant(activeGeneratorBody === this.emitter.getBody(), "generator to finalize must be current emitter body");
        this.emitter.finalizeCurrentBody();
      },
      emit: (statement: BabelNodeStatement) => {
        this.emitter.emit(statement);
      },
      processValues: (valuesToProcess: Set<AbstractValue | ObjectValue>) => {
        this.emitter.processValues(valuesToProcess);
      },
      getPropertyAssignmentStatement: this._getPropertyAssignmentStatement.bind(this),
      emitDefinePropertyBody: this.emitDefinePropertyBody.bind(this, false, undefined),
      canOmit: (value: Value) => {
        let canOmit = !this.referencedDeclaredValues.has(value) && !this.residualValues.has(value);
        if (!canOmit) {
          return false;
        }
        if (value instanceof ObjectValue && value.temporalAlias !== undefined) {
          let temporalAlias = value.temporalAlias;
          return !this.referencedDeclaredValues.has(temporalAlias) && !this.residualValues.has(temporalAlias);
        }
        return canOmit;
      },
      declare: (value: AbstractValue | ObjectValue) => {
        this.emitter.declare(value);
      },
      emitBindingModification: (binding: Binding) => {
        let residualFunctionBinding = this._getResidualFunctionBinding(binding);
        if (residualFunctionBinding !== undefined) {
          invariant(residualFunctionBinding.referentialized);
          invariant(
            residualFunctionBinding.serializedValue,
            "ResidualFunctionBinding must be referentialized before serializing a mutation to it."
          );
          let newValue = binding.value;
          invariant(newValue);
          let bindingReference = ((residualFunctionBinding.serializedValue: any): BabelNodeLVal);
          invariant(
            t.isLVal(bindingReference),
            "Referentialized values must be LVals even though serializedValues may be any Expression"
          );
          let serializedNewValue = this.serializeValue(newValue);
          this.emitter.emit(t.expressionStatement(t.assignmentExpression("=", bindingReference, serializedNewValue)));
        }
      },
      emitPropertyModification: (propertyBinding: PropertyBinding) => {
        let desc = propertyBinding.descriptor;
        let object = propertyBinding.object;
        invariant(object instanceof ObjectValue);
        if (this.residualValues.has(object)) {
          let key = propertyBinding.key;
          invariant(key !== undefined, "established by visitor");
          let dependencies = [];
          if (desc !== undefined) dependencies.push(...this._getDescriptorValues(desc));
          dependencies.push(object);
          if (key instanceof Value) dependencies.push(key);
          this.emitter.emitNowOrAfterWaitingForDependencies(
            dependencies,
            () => {
              // separate serialize object, as _emitProperty assumes that this already happened
              this.serializeValue(object);
              this._emitProperty(object, key, desc, true);
            },
            this.emitter.getBody()
          );
        }
      },
      options: this._options,
    };
    return context;
  }

  _shouldBeWrapped(body: Array<any>): boolean {
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

  _serializeAdditionalFunctionGeneratorAndEffects(
    generator: Generator,
    functionValue: FunctionValue,
    additionalEffects: AdditionalFunctionEffects
  ): Array<BabelNodeStatement> {
    return this._withGeneratorScope(
      "OptimizedFunction",
      generator,
      /*valuesToProcess*/ undefined,
      newBody => {
        let effectsGenerator = additionalEffects.generator;
        invariant(effectsGenerator === generator);
        effectsGenerator.serialize(this._getContext());
        this.realm.withEffectsAppliedInGlobalEnv(() => {
          const lazyHoistedReactNodes = this.residualReactElementSerializer.serializeLazyHoistedNodes(functionValue);
          this.mainBody.entries.push(...lazyHoistedReactNodes);
          return null;
        }, additionalEffects.effects);
      },
      functionValue
    );
  }

  // result -- serialize it, a return statement will be generated later, must be a Value
  // Generator -- visit all entries
  // Bindings -- only need to serialize bindings if they're captured by some nested function?
  //          -- need to apply them and maybe need to revisit functions in ancestors to make sure
  //          -- we don't overwrite anything they capture
  // PropertyBindings -- visit any property bindings that aren't to createdobjects
  // CreatedObjects -- should take care of itself
  _serializeAdditionalFunction(
    additionalFunctionValue: FunctionValue,
    additionalEffects: AdditionalFunctionEffects
  ): void {
    let { effects, transforms, generator, additionalRoots } = additionalEffects;
    // No function info means the function is dead code, also break recursive cycles where we've already started
    // serializing this value
    if (
      !this.additionalFunctionValueInfos.has(additionalFunctionValue) ||
      this.rewrittenAdditionalFunctions.has(additionalFunctionValue)
    ) {
      return;
    }
    this.rewrittenAdditionalFunctions.set(additionalFunctionValue, []);

    // visit all additional roots before going into the additional functions;
    // this ensures that those potentially stateful additional roots will get
    // initially serialized with the right initial effects applied.
    for (let additionalRoot of additionalRoots) this.serializeValue(additionalRoot);

    let createdObjects = effects.createdObjects;
    let nestedFunctions = new Set([...createdObjects].filter(object => object instanceof FunctionValue));
    // Allows us to emit function declarations etc. inside of this additional
    // function instead of adding them at global scope
    // TODO: make sure this generator isn't getting mutated oddly
    ((nestedFunctions: any): Set<FunctionValue>).forEach(val => this.additionalFunctionValueNestedFunctions.add(val));
    let body = this._serializeAdditionalFunctionGeneratorAndEffects(
      generator,
      additionalFunctionValue,
      additionalEffects
    );
    invariant(additionalFunctionValue instanceof ECMAScriptSourceFunctionValue);
    for (let transform of transforms) {
      transform(body);
    }
    this.rewrittenAdditionalFunctions.set(additionalFunctionValue, body);
  }

  prepareAdditionalFunctionValues(): void {
    for (let [additionalFunctionValue, { generator }] of this.additionalFunctionValuesAndEffects.entries()) {
      invariant(!this.additionalFunctionGenerators.has(additionalFunctionValue));
      this.additionalFunctionGenerators.set(additionalFunctionValue, generator);
    }
  }

  // Hook point for any serialization needs to be done after generator serialization is complete.
  postGeneratorSerialization(): void {
    // For overriding only.
  }

  serialize(): BabelNodeFile {
    this.prepareAdditionalFunctionValues();

    this.generator.serialize(this._getContext());
    this.getStatistics().generators++;
    invariant(this.emitter.declaredCount() <= this.realm.derivedIds.size);

    // TODO #20: add timers

    // TODO #21: add event listeners

    for (let [moduleId, moduleValue] of this.modules.initializedModules)
      this.requireReturns.set(moduleId, getReplacement(this.serializeValue(moduleValue), moduleValue));

    for (let [name, value] of this.declaredGlobalLets) {
      this.emitter.emit(
        t.expressionStatement(t.assignmentExpression("=", t.identifier(name), this.serializeValue(value)))
      );
    }

    this.postGeneratorSerialization();

    Array.prototype.push.apply(this.prelude, this.preludeGenerator.prelude);

    this.emitter.finalize();

    this.residualFunctions.residualFunctionInitializers.factorifyInitializers(this.factoryNameGenerator);
    let { unstrictFunctionBodies, strictFunctionBodies } = this.residualFunctions.spliceFunctions(
      this.rewrittenAdditionalFunctions
    );

    // add strict modes
    let strictDirective = t.directive(t.directiveLiteral("use strict"));
    let globalDirectives = [];
    if (!this.realm.isStrict && !unstrictFunctionBodies.length && strictFunctionBodies.length) {
      // no unstrict functions, only strict ones
      globalDirectives.push(strictDirective);
    } else if (unstrictFunctionBodies.length && strictFunctionBodies.length) {
      // strict and unstrict functions
      funcLoop: for (let node of strictFunctionBodies) {
        if (t.isFunctionExpression(node)) {
          let func = ((node: any): BabelNodeFunctionExpression);
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
    if (this.declaredGlobalLets.size > 0)
      ast_body.push(
        t.variableDeclaration(
          "let",
          Array.from(this.declaredGlobalLets.keys()).map(key => t.variableDeclarator(t.identifier(key)))
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
        let globalExpression = t.thisExpression();

        let functionExpression = t.functionExpression(null, [], t.blockStatement(body, globalDirectives));
        let callExpression = this.preludeGenerator.usesThis
          ? t.callExpression(t.memberExpression(functionExpression, t.identifier("call")), [globalExpression])
          : t.callExpression(functionExpression, []);
        ast_body.push(t.expressionStatement(callExpression));
      } else {
        Array.prototype.push.apply(ast_body, body);
      }
    }

    // Make sure that the visitor visited exactly the same values as the serializer
    if (
      this.serializedValues.size !== this.residualValues.size ||
      !Array.from(this.serializedValues).every(val => this.residualValues.has(val))
    ) {
      this._logSerializedResidualMismatches();
      invariant(false, "serialized " + this.serializedValues.size + " of " + this.residualValues.size);
    }

    // TODO: find better way to do this?
    // revert changes to functionInstances in case we do multiple serialization passes
    for (let instance of this.residualFunctionInstances.values()) {
      this.referentializer.cleanInstance(instance);
    }

    let program_directives = [];
    if (this.realm.isStrict) program_directives.push(strictDirective);
    return t.file(t.program(ast_body, program_directives));
  }

  _logScopes(scopes: Set<Scope>): void {
    console.log(`  referenced by ${scopes.size} scopes`);
    for (let s of scopes)
      if (s instanceof Generator) {
        let text = "";
        for (; s instanceof Generator; s = this.generatorTree.getParent(s)) text += "=>" + s.getName();
        console.log(`      ${text}`);
      } else {
        invariant(s instanceof FunctionValue);
        console.log(`      ${s.__originalName || JSON.stringify(s.expressionLocation) || s.constructor.name}`);
      }
  }

  _logSerializedResidualMismatches(): void {
    let logValue = value => {
      console.log(describeValue(value));
      let scopes = this.residualValues.get(value);
      if (scopes !== undefined) this._logScopes(scopes);
    };
    console.log("=== serialized but not visited values");
    for (let value of this.serializedValues) if (!this.residualValues.has(value)) logValue(value);
    console.log("=== visited but not serialized values");
    for (let value of this.residualValues.keys()) if (!this.serializedValues.has(value)) logValue(value);
  }
}
