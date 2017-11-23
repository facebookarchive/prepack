/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../../realm.js";
import {
  Value,
  AbstractValue,
  ConcreteValue,
  FunctionValue,
  NativeFunctionValue,
  StringValue,
  ObjectValue,
  UndefinedValue,
} from "../../values/index.js";
import buildExpressionTemplate from "../../utils/builder.js";
import { describeLocation } from "../ecma262/Error.js";
import { ToStringPartial } from "../../methods/index.js";
import { ValuesDomain } from "../../domains/index.js";

const throwTemplateSrc = "(function(){throw new global.Error('abstract value defined at ' + A);})()";
const throwTemplate = buildExpressionTemplate(throwTemplateSrc);

export function parseTypeNameOrTemplate(
  realm: Realm,
  typeNameOrTemplate: void | Value
): { type: typeof Value, template: void | ObjectValue } {
  if (typeNameOrTemplate === undefined || typeNameOrTemplate instanceof UndefinedValue) {
    return { type: Value, template: undefined };
  } else if (typeNameOrTemplate instanceof StringValue) {
    let typeNameString = ToStringPartial(realm, typeNameOrTemplate);
    let type = Value.getTypeFromName(typeNameString);
    if (type === undefined) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "unknown typeNameOrTemplate");
    }
    return { type, template: undefined };
  } else if (typeNameOrTemplate instanceof FunctionValue) {
    return { type: FunctionValue, template: typeNameOrTemplate };
  } else if (typeNameOrTemplate instanceof ObjectValue) {
    return { type: ObjectValue, template: typeNameOrTemplate };
  } else {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "typeNameOrTemplate has unsupported type");
  }
}

export function createAbstract(realm: Realm, ...additionalValues: Array<ConcreteValue>): NativeFunctionValue {
  return new NativeFunctionValue(
    realm,
    "global.__abstract",
    "__abstract",
    0,
    (context, [typeNameOrTemplate: void | Value, name]) => {
      if (!realm.useAbstractInterpretation) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "realm is not partial");
      }

      let { type, template } = parseTypeNameOrTemplate(realm, typeNameOrTemplate);

      let result;
      let nameString = name ? ToStringPartial(realm, name) : "";
      if (nameString === "") {
        let locString;
        for (let executionContext of realm.contextStack.slice().reverse()) {
          let caller = executionContext.caller;
          locString = describeLocation(
            realm,
            caller ? caller.function : undefined,
            caller ? caller.lexicalEnvironment : undefined,
            executionContext.loc
          );
          if (locString !== undefined) break;
        }
        let locVal = new StringValue(realm, locString || "(unknown location)");
        let kind = "__abstract_" + realm.objectCount++; // need not be an object, but must be unique
        result = AbstractValue.createFromTemplate(realm, throwTemplate, type, [locVal], kind);
      } else {
        let kind = "__abstract_" + nameString; // assume name is unique TODO #1155: check this
        result = AbstractValue.createFromTemplate(realm, buildExpressionTemplate(nameString), type, [], kind);
        result.intrinsicName = nameString;
      }

      if (template) result.values = new ValuesDomain(new Set([template]));
      if (template && !(template instanceof FunctionValue)) {
        // why exclude functions?
        template.makePartial();
        if (nameString) realm.rebuildNestedProperties(result, nameString);
      }

      if (additionalValues.length > 0)
        result = AbstractValue.createAbstractConcreteUnion(realm, result, ...additionalValues);
      return result;
    }
  );
}
