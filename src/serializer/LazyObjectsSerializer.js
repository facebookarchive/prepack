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
import { FunctionValue, Value, ObjectValue } from "../values/index.js";
import * as t from "@babel/types";
import type { BabelNodeExpression, BabelNodeStatement, BabelNodeIdentifier, BabelNodeSwitchCase } from "@babel/types";
import type { SerializedBody, AdditionalFunctionEffects, ResidualHeapInfo } from "./types.js";
import type { SerializerOptions } from "../options.js";
import invariant from "../invariant.js";
import { Logger } from "../utils/logger.js";
import { Modules } from "../utils/modules.js";
import { HeapInspector } from "../utils/HeapInspector.js";
import { ResidualHeapValueIdentifiers } from "./ResidualHeapValueIdentifiers.js";
import { ResidualHeapSerializer } from "./ResidualHeapSerializer.js";
import { getOrDefault } from "./utils.js";
import type { ResidualOptimizedFunctions } from "./ResidualOptimizedFunctions";
import type { Referentializer } from "./Referentializer.js";
import { GeneratorTree } from "./GeneratorTree.js";

const LAZY_OBJECTS_SERIALIZER_BODY_TYPE = "LazyObjectInitializer";

/**
 * Serialize objects in lazy mode by leveraging the JS runtime that support this feature.
 * Objects are serialized into two parts:
 * 1. All lazy objects are created via lightweight LazyObjectsRuntime.createLazyObject() call.
 * 2. Lazy objects' property assignments are delayed in a callback function which is registered with the runtime.
 *    lazy objects runtime will execute this callback to hydrate the lazy objects.
 *
 * Currently only the raw objects are taking part in the lazy objects feature.
 * TODO: support for other objects, like array, regex etc...
 */
export class LazyObjectsSerializer extends ResidualHeapSerializer {
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
    super(
      realm,
      logger,
      modules,
      residualHeapValueIdentifiers,
      residualHeapInspector,
      residualHeapInfo,
      options,
      additionalFunctionValuesAndEffects,
      referentializer,
      generatorTree,
      residualOptimizedFunctions
    );

    this._lazyObjectIdSeed = 1;
    this._valueLazyIds = new Map();
    this._lazyObjectInitializers = new Map();
    this._callbackLazyObjectParam = t.identifier("obj");
    invariant(this._options.lazyObjectsRuntime != null);
    this._lazyObjectJSRuntimeName = t.identifier(this._options.lazyObjectsRuntime);
    this._initializationCallbackName = t.identifier("__initializerCallback");
  }

  _lazyObjectIdSeed: number;
  _valueLazyIds: Map<ObjectValue, number>;
  // Holds object's lazy initializer bodies.
  // These bodies will be combined into a well-known callback after generator serialization is done and registered with the runtime.
  _lazyObjectInitializers: Map<ObjectValue, SerializedBody>;

  _lazyObjectJSRuntimeName: BabelNodeIdentifier;
  _callbackLazyObjectParam: BabelNodeIdentifier;
  _initializationCallbackName: BabelNodeIdentifier;

  _getValueLazyId(obj: ObjectValue): number {
    return getOrDefault(this._valueLazyIds, obj, () => this._lazyObjectIdSeed++);
  }

  // TODO: change to use _getTarget() to get the lazy objects initializer body.
  _serializeLazyObjectInitializer(
    obj: ObjectValue,
    emitIntegrityCommand: void | (SerializedBody => void)
  ): SerializedBody {
    const initializerBody = {
      type: LAZY_OBJECTS_SERIALIZER_BODY_TYPE,
      parentBody: undefined,
      entries: [],
      done: false,
    };
    let oldBody = this.emitter.beginEmitting(LAZY_OBJECTS_SERIALIZER_BODY_TYPE, initializerBody);
    this._emitObjectProperties(obj);
    if (emitIntegrityCommand !== undefined) emitIntegrityCommand(this.emitter.getBody());
    this.emitter.endEmitting(LAZY_OBJECTS_SERIALIZER_BODY_TYPE, oldBody);
    return initializerBody;
  }

  _serializeLazyObjectInitializerSwitchCase(obj: ObjectValue, initializer: SerializedBody): BabelNodeSwitchCase {
    // TODO: only serialize this switch case if the initializer(property assignment) is not empty.
    const caseBody = initializer.entries.concat(t.breakStatement());
    const lazyId = this._getValueLazyId(obj);
    return t.switchCase(t.numericLiteral(lazyId), caseBody);
  }

  _serializeInitializationCallback(): BabelNodeStatement {
    const body = [];

    const switchCases = [];
    for (const [obj, initializer] of this._lazyObjectInitializers) {
      switchCases.push(this._serializeLazyObjectInitializerSwitchCase(obj, initializer));
    }
    // Default case.
    switchCases.push(
      t.switchCase(null, [
        t.throwStatement(t.newExpression(t.identifier("Error"), [t.stringLiteral("Unknown lazy id")])),
      ])
    );

    const selector = t.identifier("id");
    body.push(t.switchStatement(selector, switchCases));

    const params = [this._callbackLazyObjectParam, selector];
    const initializerCallbackFunction = t.functionExpression(null, params, t.blockStatement(body));
    // TODO: use NameGenerator.
    return t.variableDeclaration("var", [
      t.variableDeclarator(this._initializationCallbackName, initializerCallbackFunction),
    ]);
  }

  _serializeRegisterInitializationCallback(): BabelNodeStatement {
    return t.expressionStatement(
      t.callExpression(t.memberExpression(this._lazyObjectJSRuntimeName, t.identifier("setLazyObjectInitializer")), [
        this._initializationCallbackName,
      ])
    );
  }

  _serializeCreateLazyObject(obj: ObjectValue): BabelNodeExpression {
    const lazyId = this._getValueLazyId(obj);
    return t.callExpression(
      t.memberExpression(this._lazyObjectJSRuntimeName, t.identifier("createLazyObject"), /*computed*/ false),
      [t.numericLiteral(lazyId)]
    );
  }

  /**
   * Check if the object currently being emitted is lazy object(inside _lazyObjectInitializers map) and
   * that its emitting body is the offspring of this lazy object's initializer body.
   * This is needed because for "lazy1.p = lazy2" case,
   * we need to replace "lazy1" with "obj" but not for "lazy2".
   * The offspring checking is needed because object may be emitting in a "ConditionalAssignmentBranch" of
   * lazy object's initializer body.
   */
  _isEmittingIntoLazyObjectInitializerBody(obj: ObjectValue): boolean {
    const objLazyBody = this._lazyObjectInitializers.get(obj);
    return objLazyBody !== undefined && this.emitter.isCurrentBodyOffspringOf(objLazyBody);
  }

  // Override default behavior.
  // Inside lazy objects callback, the lazy object identifier needs to be replaced with the
  // parameter passed from the runtime.
  getSerializeObjectIdentifier(val: Value): BabelNodeIdentifier {
    return val instanceof ObjectValue && this._isEmittingIntoLazyObjectInitializerBody(val)
      ? this._callbackLazyObjectParam
      : super.getSerializeObjectIdentifier(val);
  }

  // Override default serializer with lazy mode.
  serializeValueRawObject(
    obj: ObjectValue,
    skipPrototype: boolean,
    emitIntegrityCommand: void | (SerializedBody => void)
  ): BabelNodeExpression {
    if (obj.temporalAlias !== undefined) return super.serializeValueRawObject(obj, skipPrototype, emitIntegrityCommand);
    this._lazyObjectInitializers.set(obj, this._serializeLazyObjectInitializer(obj, emitIntegrityCommand));
    return this._serializeCreateLazyObject(obj);
  }

  // Override.
  // Serialize the initialization callback and its registration in prelude if there are object being lazied.
  postGeneratorSerialization(): void {
    if (this._lazyObjectInitializers.size > 0) {
      // Insert initialization callback at the end of prelude code.
      this.prelude.push(this._serializeInitializationCallback());
      this.prelude.push(this._serializeRegisterInitializationCallback());
    }
  }
}
