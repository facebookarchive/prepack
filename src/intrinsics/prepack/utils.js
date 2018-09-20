/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../../realm.js";
import {
  AbstractValue,
  ConcreteValue,
  FunctionValue,
  ObjectValue,
  StringValue,
  UndefinedValue,
  Value,
} from "../../values/index.js";
import { DisablePlaceholderSuffix } from "../../utils/PreludeGenerator.js";
import { ValuesDomain } from "../../domains/index.js";
import { describeLocation } from "../ecma262/Error.js";
import { To } from "../../singletons.js";
import AbstractObjectValue from "../../values/AbstractObjectValue.js";
import { CompilerDiagnostic, FatalError } from "../../errors.js";
import { Utils } from "../../singletons.js";
import invariant from "../../invariant.js";

const throwTemplateSrc = "(function(){throw new global.Error('abstract value defined at ' + A);})()";

export function parseTypeNameOrTemplate(
  realm: Realm,
  typeNameOrTemplate: void | Value | string
): { type: typeof Value, template: void | ObjectValue, functionResultType?: typeof Value } {
  if (typeNameOrTemplate === undefined || typeNameOrTemplate instanceof UndefinedValue) {
    return { type: Value, template: undefined };
  } else if (typeof typeNameOrTemplate === "string") {
    let type = Utils.getTypeFromName(typeNameOrTemplate);
    if (type === undefined) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "unknown typeNameOrTemplate");
    }
    return { type, template: undefined };
  } else if (typeNameOrTemplate instanceof StringValue) {
    let typeNameString = To.ToStringPartial(realm, typeNameOrTemplate);
    let hasFunctionResultType = typeNameString.startsWith(":");
    if (hasFunctionResultType) typeNameString = typeNameString.substring(1);
    let type = Utils.getTypeFromName(typeNameString);
    if (type === undefined) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "unknown typeNameOrTemplate");
    }
    return hasFunctionResultType
      ? { type: FunctionValue, template: undefined, functionResultType: type }
      : { type, template: undefined };
  } else if (typeNameOrTemplate instanceof FunctionValue) {
    return { type: FunctionValue, template: typeNameOrTemplate };
  } else if (typeNameOrTemplate instanceof ObjectValue) {
    return { type: ObjectValue, template: typeNameOrTemplate };
  } else {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "typeNameOrTemplate has unsupported type");
  }
}

export function createAbstract(
  realm: Realm,
  typeNameOrTemplate?: Value | string,
  name?: string,
  options?: ObjectValue,
  ...additionalValues: Array<ConcreteValue>
): AbstractValue | AbstractObjectValue {
  if (!realm.useAbstractInterpretation) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "realm is not partial");
  }

  let { type, template, functionResultType } = parseTypeNameOrTemplate(realm, typeNameOrTemplate);
  let optionsMap = options ? options.properties : new Map();

  let result;
  let locString,
    loc = null;
  for (let executionContext of realm.contextStack.slice().reverse()) {
    let caller = executionContext.caller;
    loc = executionContext.loc;
    locString = describeLocation(
      realm,
      caller ? caller.function : undefined,
      caller ? caller.lexicalEnvironment : undefined,
      loc
    );
    if (locString !== undefined) break;
  }
  if (name === undefined) {
    let locVal = new StringValue(realm, locString !== undefined ? locString : "(unknown location)");
    result = AbstractValue.createFromTemplate(realm, throwTemplateSrc, type, [locVal]);
    result.hashValue = ++realm.objectCount; // need not be an object, but must be unique
  } else {
    if (!optionsMap.get("allowDuplicateNames") && !realm.isNameStringUnique(name)) {
      let error = new CompilerDiagnostic("An abstract value with the same name exists", loc, "PP0019", "FatalError");
      realm.handleError(error);
      throw new FatalError();
    } else {
      realm.saveNameString(name);
    }
    result = AbstractValue.createFromTemplate(
      realm,
      optionsMap.get("disablePlaceholders") ? name + DisablePlaceholderSuffix : name,
      type,
      []
    );
    result.intrinsicName = name;
  }

  if (template) result.values = new ValuesDomain(new Set([template]));
  if (template && !(template instanceof FunctionValue)) {
    // why exclude functions?
    template.makePartial();
    if (name !== undefined) realm.rebuildNestedProperties(result, name);
  }
  if (functionResultType) {
    invariant(result instanceof AbstractObjectValue);
    result.functionResultType = functionResultType;
  }

  if (additionalValues.length > 0) result = AbstractValue.createAbstractConcreteUnion(realm, result, additionalValues);
  return result;
}
