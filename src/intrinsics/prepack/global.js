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
  BoundFunctionValue,
  ConcreteValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  IntegralValue,
  NativeFunctionValue,
  ObjectValue,
  StringValue,
  Value,
} from "../../values/index.js";
import { To, Path } from "../../singletons.js";
import { IsCallable } from "../../methods/index.js";
import { ValuesDomain } from "../../domains/index.js";
import invariant from "../../invariant.js";
import { createAbstract, parseTypeNameOrTemplate } from "./utils.js";
import { describeValue } from "../../utils.js";
import { valueIsKnownReactAbstraction } from "../../react/utils.js";
import { CompilerDiagnostic, FatalError } from "../../errors.js";
import * as t from "@babel/types";
import { createOperationDescriptor, type OperationDescriptor } from "../../utils/generator.js";
import { createAndValidateArgModel } from "../../utils/ShapeInformation";
import { PropertyDescriptor } from "../../descriptors.js";

export function createAbstractFunction(realm: Realm, ...additionalValues: Array<ConcreteValue>): NativeFunctionValue {
  return new NativeFunctionValue(
    realm,
    "global.__abstract",
    "__abstract",
    0,
    (context, [typeNameOrTemplate, _name, options]) => {
      let name = _name;
      if (name instanceof StringValue) name = name.value;
      if (name !== undefined && typeof name !== "string") {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "intrinsic name argument is not a string");
      }
      if (options && !(options instanceof ObjectValue)) {
        throw realm.createErrorThrowCompletion(
          realm.intrinsics.TypeError,
          "options must be an ObjectValue if provided"
        );
      }
      return createAbstract(realm, typeNameOrTemplate, name, options, ...additionalValues);
    }
  );
}

export default function(realm: Realm): void {
  let global = realm.$GlobalObject;

  global.$DefineOwnProperty(
    "__dump",
    new PropertyDescriptor({
      value: new NativeFunctionValue(realm, "global.__dump", "__dump", 0, (context, args) => {
        console.log("dump", args.map(arg => arg.serialize()));
        return context;
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // Helper function to model values that are obtained from the environment,
  // and whose concrete values are not known at Prepack-time.
  // __abstract(typeNameOrTemplate, name, options) creates a new abstract value
  // where typeNameOrTemplate can be...
  // - 'string', 'boolean', 'number', 'object', 'function' or
  // - ':string', ':boolean', ':number', ':object', ':function' to indicate that
  //   the abstract value represents a function that only returns values of the specified type, or
  // - an actual object defining known properties.
  // options is an optional object that may contain:
  // - allowDuplicateNames: boolean representing whether the name of the abstract value may be
  //   repeated, by default they must be unique
  // - disablePlaceholders: boolean representing whether placeholders should be substituted in
  //   the abstract value's name.
  // If the abstract value gets somehow embedded in the final heap,
  // it will be referred to by the supplied name in the generated code.
  global.$DefineOwnProperty(
    "__abstract",
    new PropertyDescriptor({
      value: createAbstractFunction(realm),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  global.$DefineOwnProperty(
    "__abstractOrNull",
    new PropertyDescriptor({
      value: createAbstractFunction(realm, realm.intrinsics.null),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  global.$DefineOwnProperty(
    "__abstractOrNullOrUndefined",
    new PropertyDescriptor({
      value: createAbstractFunction(realm, realm.intrinsics.null, realm.intrinsics.undefined),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  global.$DefineOwnProperty(
    "__abstractOrUndefined",
    new PropertyDescriptor({
      value: createAbstractFunction(realm, realm.intrinsics.undefined),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // Allows dynamically registering optimized functions.
  // WARNING: these functions will get exposed at global scope and called there.
  // NB: If we interpret one of these calls in an evaluateForEffects context
  //     that is not subsequently applied, the function will not be registered
  //     (because prepack won't have a correct value for the FunctionValue itself)
  // If we encounter an invalid input, we will emit a warning and not optimize the function
  global.$DefineOwnProperty(
    "__optimize",
    new PropertyDescriptor({
      value: new NativeFunctionValue(
        realm,
        "global.__optimize",
        "__optimize",
        1,
        (context, [value, argModelString]) => {
          let argModel;
          if (argModelString !== undefined) {
            argModel = createAndValidateArgModel(realm, argModelString);
          }
          if (value instanceof ECMAScriptSourceFunctionValue || value instanceof AbstractValue) {
            let currentArgModel = realm.optimizedFunctions.get(value);
            // Verify that if there is an existing argModel, that it is the same as the new one.
            if (currentArgModel) {
              let currentString = argModelString instanceof StringValue ? argModelString.value : argModelString;
              if (JSON.stringify(currentArgModel) !== currentString) {
                let argModelError = new CompilerDiagnostic(
                  "__optimize called twice with different argModelStrings",
                  realm.currentLocation,
                  "PP1008",
                  "Warning"
                );
                if (realm.handleError(argModelError) !== "Recover") throw new FatalError();
                else return realm.intrinsics.undefined;
              }
            }
            realm.optimizedFunctions.set(value, argModel);
          } else {
            let location = value.expressionLocation
              ? `${value.expressionLocation.start.line}:${value.expressionLocation.start.column} ` +
                `${value.expressionLocation.end.line}:${value.expressionLocation.end.line}`
              : "location unknown";
            let result = realm.handleError(
              new CompilerDiagnostic(
                `Optimized Function Value ${location} is an not a function or react element`,
                realm.currentLocation,
                "PP0033",
                "Warning"
              )
            );
            if (result !== "Recover") throw new FatalError();
            else return realm.intrinsics.undefined;
          }
          return value;
        }
      ),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  if (realm.react.enabled) {
    global.$DefineOwnProperty(
      "__reactComponentTrees",
      new PropertyDescriptor({
        value: new ObjectValue(
          realm,
          realm.intrinsics.ObjectPrototype,
          "__reactComponentTrees",
          /* refuseSerialization */ true
        ),
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );
    let reactComponentRootUid = 0;
    global.$DefineOwnProperty(
      "__optimizeReactComponentTree",
      new PropertyDescriptor({
        value: new NativeFunctionValue(
          realm,
          "global.__optimizeReactComponentTree",
          "__optimizeReactComponentTree",
          0,
          (context, [component, config]) => {
            let hasValidComponent =
              component instanceof ECMAScriptSourceFunctionValue ||
              component instanceof BoundFunctionValue ||
              valueIsKnownReactAbstraction(realm, component);
            let hasValidConfig =
              config instanceof ObjectValue || config === realm.intrinsics.undefined || config === undefined;

            if (!hasValidComponent || !hasValidConfig) {
              let diagnostic = new CompilerDiagnostic(
                "__optimizeReactComponentTree(rootComponent, config) has been called with invalid arguments",
                realm.currentLocation,
                "PP0024",
                "FatalError"
              );
              realm.handleError(diagnostic);
              if (realm.handleError(diagnostic) === "Fail") throw new FatalError();
            }
            let reactComponentTree = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
            reactComponentTree.$Set("rootComponent", component, reactComponentTree);
            reactComponentTree.$Set("config", config || realm.intrinsics.undefined, reactComponentTree);

            realm.assignToGlobal(
              t.memberExpression(
                t.memberExpression(t.identifier("global"), t.identifier("__reactComponentTrees")),
                t.identifier("" + reactComponentRootUid++)
              ),
              reactComponentTree
            );
            return component;
          }
        ),
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );
  }

  global.$DefineOwnProperty(
    "__evaluatePureFunction",
    new PropertyDescriptor({
      value: new NativeFunctionValue(
        realm,
        "global.__evaluatePureFunction",
        "__evaluatePureFunction",
        0,
        (context, [functionValue]) => {
          invariant(!realm.isInPureScope(), "__evaluatePureFunction cannot be nested in another pure scope");
          invariant(functionValue instanceof ECMAScriptSourceFunctionValue);
          invariant(typeof functionValue.$Call === "function");
          let functionCall: Function = functionValue.$Call;
          return realm.evaluateWithPureScope(() => functionCall(realm.intrinsics.undefined, []));
        }
      ),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // Maps from initialized moduleId to exports object
  // NB: Changes to this shouldn't ever be serialized
  global.$DefineOwnProperty(
    "__initializedModules",
    new PropertyDescriptor({
      value: new ObjectValue(
        realm,
        realm.intrinsics.ObjectPrototype,
        "__initializedModules",
        /* refuseSerialization */ true
      ),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // Set of property bindings whose invariant got checked
  // NB: Changes to this shouldn't ever be serialized
  global.$DefineOwnProperty(
    "__checkedBindings",
    new PropertyDescriptor({
      value: new ObjectValue(
        realm,
        realm.intrinsics.ObjectPrototype,
        "__checkedBindings",
        /* refuseSerialization */ true
      ),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // Helper function used to instantiate a residual function
  function createNativeFunctionForResidualCall(unsafe: boolean): NativeFunctionValue {
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
        let result = AbstractValue.createTemporalFromBuildFunction(
          realm,
          type,
          [f].concat(args),
          createOperationDescriptor("RESIDUAL_CALL")
        );
        if (template) {
          invariant(
            result instanceof AbstractValue,
            "the nested properties should only be rebuilt for an abstract value"
          );
          template.makePartial();
          result.values = new ValuesDomain(new Set([template]));
          invariant(realm.generator);
          realm.rebuildNestedProperties(result, result.getIdentifier());
        }
        return result;
      }
    );
  }

  function createNativeFunctionForResidualInjection(
    name: string,
    initializeAndValidateArgs: (Array<Value>) => void,
    operationDescriptor: OperationDescriptor,
    numArgs: number
  ): NativeFunctionValue {
    return new NativeFunctionValue(realm, "global." + name, name, numArgs, (context, ciArgs) => {
      initializeAndValidateArgs(ciArgs);
      invariant(realm.generator !== undefined);
      realm.generator.emitStatement(ciArgs, operationDescriptor);
      return realm.intrinsics.undefined;
    });
  }

  // Helper function that specifies a dynamic invariant that cannot be evaluated at prepack time, and needs code to
  // be injected into the serialized output.
  global.$DefineOwnProperty(
    "__assume",
    new PropertyDescriptor({
      value: createNativeFunctionForResidualInjection(
        "__assume",
        ([c, s]): void => {
          if (!c.mightBeTrue()) {
            let error = new CompilerDiagnostic(
              `Assumed condition cannot hold`,
              realm.currentLocation,
              "PP0040",
              "FatalError"
            );
            realm.handleError(error);
            throw new FatalError();
          }
          Path.pushAndRefine(c);
        },
        createOperationDescriptor("ASSUME_CALL"),
        2
      ),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // Helper function for Prepack developers inspect a value
  // when interpreting a particular node in the AST.
  global.$DefineOwnProperty(
    "__debugValue",
    new PropertyDescriptor({
      value: createNativeFunctionForResidualInjection(
        "__debugValue",
        ([v, s]): void => {
          debugger; // eslint-disable-line no-debugger
        },
        createOperationDescriptor("NOOP"),
        2
      ),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // Helper function that identifies a computation that must remain part of the residual program and cannot be partially evaluated,
  // e.g. because it contains a loop over abstract values.
  // __residual(typeNameOrTemplate, function, arg0, arg1, ...) creates a new abstract value
  // that is computed by invoking function(arg0, arg1, ...) in the residual program and
  // where typeNameOrTemplate either either 'string', 'boolean', 'number', 'object', or an actual object defining known properties.
  // The function must not have side effects, and it must not access any state (besides the supplied arguments).
  global.$DefineOwnProperty(
    "__residual",
    new PropertyDescriptor({
      value: createNativeFunctionForResidualCall(false),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // Helper function that identifies a variant of the residual function that has implicit dependencies. This version of residual will infer the dependencies
  // and rewrite the function body to do the same thing as the original residual function.
  global.$DefineOwnProperty(
    "__residual_unsafe",
    new PropertyDescriptor({
      value: createNativeFunctionForResidualCall(true),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // Internal helper function for tests.
  // __isAbstract(value) checks if a given value is abstract.
  global.$DefineOwnProperty(
    "__isAbstract",
    new PropertyDescriptor({
      value: new NativeFunctionValue(realm, "global.__isAbstract", "__isAbstract", 1, (context, [value]) => {
        return new BooleanValue(realm, value instanceof AbstractValue);
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // __makePartial(object) marks an (abstract) object as partial.
  global.$DefineOwnProperty(
    "__makePartial",
    new PropertyDescriptor({
      value: new NativeFunctionValue(realm, "global.__makePartial", "__makePartial", 1, (context, [object]) => {
        if (object instanceof AbstractObjectValue || object instanceof ObjectValue) {
          object.makePartial();
          return object;
        }
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not an (abstract) object");
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  global.$DefineOwnProperty(
    "__makeFinal",
    new PropertyDescriptor({
      value: new NativeFunctionValue(realm, "global.__makeFinal", "__makeFinal", 1, (context, [object]) => {
        if (object instanceof ObjectValue || (object instanceof AbstractObjectValue && !object.values.isTop())) {
          object.makeFinal();
          return object;
        }
        throw realm.createErrorThrowCompletion(
          realm.intrinsics.TypeError,
          "not an object or abstract object value (non-top)"
        );
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // __makeSimple(object) marks an (abstract) object as one that has no getters or setters.
  global.$DefineOwnProperty(
    "__makeSimple",
    new PropertyDescriptor({
      value: new NativeFunctionValue(realm, "global.__makeSimple", "__makeSimple", 1, (context, [object, option]) => {
        if (object instanceof AbstractObjectValue || object instanceof ObjectValue) {
          object.makeSimple(option);
          return object;
        }
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not an (abstract) object");
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // Helper function that emits a check whether a given object property has a particular value.
  global.$DefineOwnProperty(
    "__assumeDataProperty",
    new PropertyDescriptor({
      value: new NativeFunctionValue(
        realm,
        "global.__assumeDataProperty",
        "__assumeDataProperty",
        3,
        (context, [object, propertyName, value, invariantOptions]) => {
          if (!realm.useAbstractInterpretation) {
            throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "realm is not partial");
          }

          if (object instanceof AbstractObjectValue || object instanceof ObjectValue) {
            let generator = realm.generator;
            invariant(generator);

            let key = To.ToStringPartial(realm, propertyName);

            if (realm.emitConcreteModel) {
              generator.emitConcreteModel(key, value);
            } else if (realm.invariantLevel >= 1) {
              let invariantOptionString = invariantOptions
                ? To.ToStringPartial(realm, invariantOptions)
                : "FULL_INVARIANT";
              switch (invariantOptionString) {
                // checks (!property in object || object.property === undefined)
                case "VALUE_DEFINED_INVARIANT":
                  generator.emitPropertyInvariant(object, key, value.mightBeUndefined() ? "PRESENT" : "DEFINED");
                  break;
                case "SKIP_INVARIANT":
                  break;
                case "FULL_INVARIANT":
                  generator.emitFullInvariant((object: any), key, value);
                  break;
                default:
                  invariant(false, "Invalid invariantOption " + invariantOptionString);
              }
              if (!realm.neverCheckProperty(object, key)) realm.markPropertyAsChecked(object, key);
            }
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
    })
  );

  // Helper function that replaces the implementation of a source function with
  // the details from another source function body, including the captured
  // environment, the actual code, etc.
  // This realizes a form of monkey-patching, enabling mocking a function if
  // one doesn't control all existing references to that function,
  // or if the storage location to those references cannot be easily updated.
  // NOTE: This function affects un-tracked state, so care must be taken
  // that this helper function is executed at the right time; typically, one
  // would want to execute this function before any call is executed to that
  // function. Care must be taken not to make reachable conditionally
  // defined values. Because of this limitations, this helper function
  // should be considered only as a last resort.
  global.$DefineOwnProperty(
    "__replaceFunctionImplementation_unsafe",
    new PropertyDescriptor({
      value: new NativeFunctionValue(
        realm,
        "global.__replaceFunctionImplementation_unsafe",
        "__replaceFunctionImplementation_unsafe",
        2,
        (context, [target, source]) => {
          if (!(target instanceof ECMAScriptSourceFunctionValue)) {
            throw realm.createErrorThrowCompletion(
              realm.intrinsics.TypeError,
              "first argument is not a function with source code"
            );
          }
          if (!(source instanceof ECMAScriptSourceFunctionValue)) {
            throw realm.createErrorThrowCompletion(
              realm.intrinsics.TypeError,
              "second argument is not a function with source code"
            );
          }

          // relevant properties for functionValue
          target.$Environment = source.$Environment;
          target.$ScriptOrModule = source.$ScriptOrModule;

          // properties for ECMAScriptFunctionValue
          target.$ConstructorKind = source.$ConstructorKind;
          target.$ThisMode = source.$ThisMode;
          target.$HomeObject = source.$HomeObject;
          target.$FunctionKind = source.$FunctionKind;

          // properties for ECMAScriptSourceFunctionValue
          target.$Strict = source.$Strict;
          target.$FormalParameters = source.$FormalParameters;
          target.$ECMAScriptCode = source.$ECMAScriptCode;
          target.$HasComputedName = source.$HasComputedName;
          target.$HasEmptyConstructor = source.$HasEmptyConstructor;
          target.loc = source.loc;

          return context.$Realm.intrinsics.undefined;
        }
      ),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  global.$DefineOwnProperty(
    "__IntrospectionError",
    new PropertyDescriptor({
      value: realm.intrinsics.__IntrospectionError,
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  global.$DefineOwnProperty(
    "__isIntegral",
    new PropertyDescriptor({
      value: new NativeFunctionValue(realm, "global.__isIntegral", "__isIntegral", 1, (context, [value]) => {
        return new BooleanValue(realm, value instanceof IntegralValue);
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  global.$DefineOwnProperty(
    "__describe",
    new PropertyDescriptor({
      value: new NativeFunctionValue(realm, "global.__describe", "__describe", 1, (context, [value]) => {
        return new StringValue(realm, describeValue(value));
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  global.$DefineOwnProperty(
    "__fatal",
    new PropertyDescriptor({
      value: new NativeFunctionValue(realm, "global.__fatal", "__fatal", 0, (context, []) => {
        throw new FatalError();
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  global.$DefineOwnProperty(
    "__eagerlyRequireModuleDependencies",
    new PropertyDescriptor({
      value: new NativeFunctionValue(
        realm,
        "global.__eagerlyRequireModuleDependencies",
        "__eagerlyRequireModuleDependencies",
        1,
        (context, [functionValue]) => {
          if (!IsCallable(realm, functionValue) || !(functionValue instanceof FunctionValue))
            throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "argument must be callable function");
          let functionCall: void | ((thisArgument: Value, argumentsList: Array<Value>) => Value) = functionValue.$Call;
          if (typeof functionCall !== "function") {
            throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "argument must be directly callable");
          }
          let old = realm.eagerlyRequireModuleDependencies;
          realm.eagerlyRequireModuleDependencies = true;
          try {
            return functionCall(realm.intrinsics.undefined, []);
          } finally {
            realm.eagerlyRequireModuleDependencies = old;
          }
        }
      ),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );
}
