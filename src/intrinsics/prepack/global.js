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
  AbstractObjectValue,
  AbstractValue,
  BooleanValue,
  FunctionValue,
  NativeFunctionValue,
  ConcreteValue,
  ObjectValue,
  Value,
  ECMAScriptSourceFunctionValue,
} from "../../values/index.js";
import { To } from "../../singletons.js";
import { ValuesDomain } from "../../domains/index.js";
import * as t from "babel-types";
import type { BabelNodeExpression, BabelNodeSpreadElement } from "babel-types";
import invariant from "../../invariant.js";
import { createAbstract, parseTypeNameOrTemplate } from "./utils.js";

export function createAbstractFunction(realm: Realm, ...additionalValues: Array<ConcreteValue>): NativeFunctionValue {
  return new NativeFunctionValue(realm, "global.__abstract", "__abstract", 0, (context, [typeNameOrTemplate, name]) =>
    // this line really confuses Flow
    createAbstract(realm, typeNameOrTemplate, ((name: any): string | void), ...additionalValues)
  );
}

export default function(realm: Realm): void {
  let global = realm.$GlobalObject;

  global.$DefineOwnProperty("dump", {
    value: new NativeFunctionValue(realm, "global.dump", "dump", 0, (context, args) => {
      console.log("dump", args.map(arg => arg.serialize()));
      return context;
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // Helper function to model values that are obtained from the environment,
  // and whose concrete values are not known at Prepack-time.
  // __abstract(typeNameOrTemplate, name, options) creates a new abstract value
  // where typeNameOrTemplate either either 'string', 'boolean', 'number', 'object', or an actual object defining known properties.
  // If the abstract value gets somehow embedded in the final heap,
  // it will be referred to by the supplied name in the generated code.
  global.$DefineOwnProperty("__abstract", {
    value: createAbstractFunction(realm),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  global.$DefineOwnProperty("__abstractOrNull", {
    value: createAbstractFunction(realm, realm.intrinsics.null),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  global.$DefineOwnProperty("__abstractOrNullOrUndefined", {
    value: createAbstractFunction(realm, realm.intrinsics.null, realm.intrinsics.undefined),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  global.$DefineOwnProperty("__abstractOrUndefined", {
    value: createAbstractFunction(realm, realm.intrinsics.undefined),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  global.$DefineOwnProperty("__additionalFunctions", {
    value: new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "__additionalFunctions", true),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  let additonalFunctionUid = 0;
  // Allows dynamically registering additional functions.
  // WARNING: these functions will get exposed at global scope and called there.
  // NB: If we interpret one of these calls in an evaluateForEffects context
  //     that is not subsequently applied, the function will not be registered
  //     (because prepack won't have a correct value for the FunctionValue itself)
  global.$DefineOwnProperty("__registerAdditionalFunctionToPrepack", {
    value: new NativeFunctionValue(
      realm,
      "global.__registerAdditionalFunctionToPrepack",
      "__registerAdditionalFunctionToPrepack",
      0,
      (context, [functionValue]) => {
        invariant(functionValue instanceof ECMAScriptSourceFunctionValue);
        realm.assignToGlobal(
          t.memberExpression(
            t.memberExpression(t.identifier("global"), t.identifier("__additionalFunctions")),
            t.identifier("" + additonalFunctionUid++)
          ),
          functionValue
        );
        return realm.intrinsics.undefined;
      }
    ),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  if (realm.react.enabled) {
    global.$DefineOwnProperty("__reactComponentRoots", {
      value: new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "__reactComponentRoots", true),
      writable: true,
      enumerable: false,
      configurable: true,
    });
    let reactComponentRootUid = 0;
    // this is almost a copy of the additionalFunctions code above
    global.$DefineOwnProperty("__registerReactComponentRoot", {
      value: new NativeFunctionValue(
        realm,
        "global.__registerReactComponentRoot",
        "__registerReactComponentRoot",
        0,
        (context, [functionValue]) => {
          invariant(functionValue instanceof ECMAScriptSourceFunctionValue);
          realm.assignToGlobal(
            t.memberExpression(
              t.memberExpression(t.identifier("global"), t.identifier("__reactComponentRoots")),
              t.identifier("" + reactComponentRootUid++)
            ),
            functionValue
          );
          return realm.intrinsics.undefined;
        }
      ),
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  // Maps from initialized moduleId to exports object
  // NB: Changes to this shouldn't ever be serialized
  global.$DefineOwnProperty("__initializedModules", {
    value: new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "__initializedModules", true),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // Helper function used to instatiate a residual function
  function deriveNativeFunctionValue(unsafe: boolean): NativeFunctionValue {
    return new NativeFunctionValue(
      realm,
      "global.__residual",
      "__residual",
      2,
      (context, [typeNameOrTemplate, f, ...args]) => {
        if (!realm.useAbstractInterpretation) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "realm is not partial");
        }

        let { type, template } = parseTypeNameOrTemplate(realm, typeNameOrTemplate);

        if (!Value.isTypeCompatibleWith(f.constructor, FunctionValue)) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "cannot determine residual function");
        }
        invariant(f instanceof FunctionValue);
        f.isResidual = true;
        if (unsafe) f.isUnsafeResidual = true;
        let result = AbstractValue.createTemporalFromBuildFunction(realm, type, [f].concat(args), nodes =>
          t.callExpression(nodes[0], ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>))
        );
        if (template) {
          invariant(
            result instanceof AbstractValue,
            "the nested properties should only be rebuilt for an abstract value"
          );
          template.makePartial();
          result.values = new ValuesDomain(new Set([template]));
          invariant(realm.generator);
          realm.rebuildNestedProperties(result, result.getIdentifier().name);
        }
        return result;
      }
    );
  }

  // Helper function that identifies a computation that must remain part of the residual program and cannot be partially evaluated,
  // e.g. because it contains a loop over abstract values.
  // __residual(typeNameOrTemplate, function, arg0, arg1, ...) creates a new abstract value
  // that is computed by invoking function(arg0, arg1, ...) in the residual program and
  // where typeNameOrTemplate either either 'string', 'boolean', 'number', 'object', or an actual object defining known properties.
  // The function must not have side effects, and it must not access any state (besides the supplied arguments).
  global.$DefineOwnProperty("__residual", {
    value: deriveNativeFunctionValue(false),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // Helper function that identifies a variant of the residual function that has implicit dependencies. This version of residual will infer the dependencies
  // and rewrite the function body to do the same thing as the original residual function.
  global.$DefineOwnProperty("__residual_unsafe", {
    value: deriveNativeFunctionValue(true),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // TODO #1023: Remove this property. It's just here as some existing internal test cases assume that the __annotate property is exists and is readable.
  global.$DefineOwnProperty("__annotate", {
    value: realm.intrinsics.undefined,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // Internal helper function for tests.
  // __isAbstract(value) checks if a given value is abstract.
  global.$DefineOwnProperty("__isAbstract", {
    value: new NativeFunctionValue(realm, "global.__isAbstract", "__isAbstract", 1, (context, [value]) => {
      return new BooleanValue(realm, value instanceof AbstractValue);
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // __makePartial(object) marks an (abstract) object as partial.
  global.$DefineOwnProperty("__makePartial", {
    value: new NativeFunctionValue(realm, "global.__makePartial", "__makePartial", 1, (context, [object]) => {
      // casting to any to avoid Flow bug
      if ((object: any) instanceof AbstractObjectValue || (object: any) instanceof ObjectValue) {
        (object: any).makePartial();
        return object;
      }
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not an (abstract) object");
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // __makeSimple(object) marks an (abstract) object as one that has no getters or setters.
  global.$DefineOwnProperty("__makeSimple", {
    value: new NativeFunctionValue(realm, "global.__makeSimple", "__makeSimple", 1, (context, [object]) => {
      // casting to any to avoid Flow bug
      if ((object: any) instanceof AbstractObjectValue || (object: any) instanceof ObjectValue) {
        (object: any).makeSimple();
        return object;
      }
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not an (abstract) object");
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // Helper function that emits a check whether a given object property has a particular value.
  global.$DefineOwnProperty("__assumeDataProperty", {
    value: new NativeFunctionValue(
      realm,
      "global.__assumeDataProperty",
      "__assumeDataProperty",
      3,
      (context, [object, propertyName, value, invariantOptions]) => {
        if (!realm.useAbstractInterpretation) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "realm is not partial");
        }

        // casting to any to avoid Flow bug "*** Recursion limit exceeded ***"
        if ((object: any) instanceof AbstractObjectValue || (object: any) instanceof ObjectValue) {
          let generator = realm.generator;
          invariant(generator);

          let key = To.ToStringPartial(realm, propertyName);
          let propertyIdentifier = generator.getAsPropertyNameExpression(key);
          let computed = !t.isIdentifier(propertyIdentifier);
          let condition = ([objectNode, valueNode]) =>
            t.binaryExpression("!==", t.memberExpression(objectNode, propertyIdentifier, computed), valueNode);
          if (invariantOptions) {
            let invariantOptionString = To.ToStringPartial(realm, invariantOptions);
            switch (invariantOptionString) {
              case "VALUE_DEFINED_INVARIANT":
                condition = ([objectNode, valueNode]) =>
                  t.binaryExpression(
                    "===",
                    t.memberExpression(objectNode, propertyIdentifier, computed),
                    t.valueToNode(undefined)
                  );
                break;
              case "SKIP_INVARIANT":
                condition = null;
                break;
              case "FULL_INVARIANT":
                break;
              default:
                invariant(false, "Invalid invariantOption " + invariantOptionString);
            }
          }
          if (condition)
            generator.emitInvariant([object, value, object], condition, objnode =>
              t.memberExpression(objnode, propertyIdentifier, computed)
            );
          realm.generator = undefined; // don't emit code during the following $Set call
          // casting to due to Flow workaround above
          (object: any).$Set(key, value, object);
          realm.generator = generator;
          if (object.intrinsicName) realm.rebuildObjectProperty(object, key, value, object.intrinsicName);
          return context.$Realm.intrinsics.undefined;
        }

        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not an (abstract) object");
      }
    ),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  global.$DefineOwnProperty("__IntrospectionError", {
    value: realm.intrinsics.__IntrospectionError,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
