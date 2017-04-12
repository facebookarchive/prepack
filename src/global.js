/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "./realm.js";
import { Value, StringValue, BooleanValue, ObjectValue, FunctionValue, NativeFunctionValue, AbstractValue, AbstractObjectValue, UndefinedValue } from "./values/index.js";
import { ToStringPartial } from "./methods/index.js";
import { ThrowCompletion } from "./completions.js";
import { Construct, ObjectCreate } from "./methods/index.js";
import { TypesDomain, ValuesDomain } from "./domains/index.js";
import buildExpressionTemplate from "./utils/builder.js";
import * as t from "babel-types";
import type { BabelNodeExpression, BabelNodeSpreadElement, BabelNodeIdentifier } from "babel-types";
import invariant from "./invariant.js";
import { describeLocation } from "./intrinsics/ecma262/Error.js";

let buildThrowErrorAbstractValue = buildExpressionTemplate("(function(){throw new Error('abstract value defined at ' + LOCATION);})()");

export default function (realm: Realm): ObjectValue {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "this");

  obj.$DefineOwnProperty("global", {
    value: obj,
    writable: true,
    enumerable: false,
    configurable: true
  });

  if (realm.compatibility === "browser") obj.$DefineOwnProperty("self", {
    value: obj,
    writable: true,
    enumerable: true,
    configurable: true
  });

  if (realm.compatibility === "browser") obj.$DefineOwnProperty("window", {
    value: obj,
    writable: true,
    enumerable: true,
    configurable: true
  });

  obj.$DefineOwnProperty("setTimeout", {
    value: new NativeFunctionValue(realm, "global.setTimeout", "", 2, (context, args) => {
      throw new Error("TODO: implement global.setTimeout");
    }),
    writable: true,
    enumerable: true,
    configurable: true
  });

  obj.$DefineOwnProperty("setInterval", {
    value: new NativeFunctionValue(realm, "global.setInterval", "", 2, (context, args) => {
      throw new Error("TODO: implement global.setInterval");
    }),
    writable: true,
    enumerable: true,
    configurable: true
  });

  obj.$DefineOwnProperty("dump", {
    value: new NativeFunctionValue(realm, "global.dump", "dump", 0, (context, args) => {
      console.log("dump", args.map((arg) => arg.serialize()));
      return context;
    }),
    writable: true,
    enumerable: false,
    configurable: true
  });

  function parseTypeNameOrTemplate(typeNameOrTemplate): { type: typeof Value, template: void | ObjectValue } {
    if (typeNameOrTemplate === undefined || typeNameOrTemplate instanceof UndefinedValue) {
      return { type: Value, template: undefined };
    } else if (typeNameOrTemplate instanceof StringValue) {
      let typeNameString = ToStringPartial(realm, typeNameOrTemplate);
      let type = Value.getTypeFromName(typeNameString);
      if (type === undefined) {
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "unknown typeNameOrTemplate")])
        );
      }
      return { type, template: Value.isTypeCompatibleWith(type, ObjectValue) ? ObjectCreate(realm, realm.intrinsics.ObjectPrototype) : undefined };
    } else if (typeNameOrTemplate instanceof ObjectValue) {
      return { type: ObjectValue, template: typeNameOrTemplate };
    } else {
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "typeNameOrTemplate has unsupoorted type")])
      );
    }
  }

  // Helper function to model values that are obtained from the environment,
  // and whose concrete values are not known at Prepack-time.
  // __abstract(typeNameOrTemplate, name, options) creates a new abstract value
  // where typeNameOrTemplate either either 'string', 'boolean', 'number', 'object', or an actual object defining known properties.
  // If the abstract value gets somehow embedded in the final heap,
  // it will be referred to by the supplied name in the generated code.
  obj.$DefineOwnProperty("__abstract", {
    value: new NativeFunctionValue(realm, "global.__abstract", "__abstract", 0, (context, [typeNameOrTemplate, name]) => {
      if (!realm.isPartial) {
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "realm is not partial")])
        );
      }

      let { type, template } = parseTypeNameOrTemplate(typeNameOrTemplate);

      let nameString = name ? ToStringPartial(realm, name) : "";
      let buildNode;
      if (nameString === "") {
        let locString;
        for (let executionContext of realm.contextStack.slice().reverse()) {
          let caller = executionContext.caller;
          locString = describeLocation(realm, caller ? caller.function : undefined, caller ? caller.lexicalEnvironment : undefined, executionContext.loc);
          if (locString !== undefined) break;
        }

        buildNode = () => buildThrowErrorAbstractValue({ LOCATION: t.stringLiteral(locString || "(unknown location)") });
      } else {
        buildNode = buildExpressionTemplate(nameString);
      }

      let types = new TypesDomain(type);
      let values = template ? new ValuesDomain(new Set([template])) : ValuesDomain.topVal;
      let result = realm.createAbstract(types, values, [], buildNode, undefined, nameString);
      if (template) {
        template.makePartial();
        if (nameString) realm.rebuildNestedProperties(result, nameString);
      }
      return result;
    }),
    writable: true,
    enumerable: false,
    configurable: true
  });

  // Helper function that identifies a computation that must remain part of the residual program and cannot be partially evaluated,
  // e.g. because it contains a loop over abstract values.
  // __residual(typeNameOrTemplate, function, arg0, arg1, ...) creates a new abstract value
  // that is computed by invoking function(arg0, arg1, ...) in the residual program and
  // where typeNameOrTemplate either either 'string', 'boolean', 'number', 'object', or an actual object defining known properties.
  // The function must not have side effects, and it must not access any state (besides the supplied arguments).
  // TODO: In some distant future, Prepack should be able to figure out automatically what computations need to remain part of the residual program.
  obj.$DefineOwnProperty("__residual", {
    value: new NativeFunctionValue(realm, "global.__residual", "__residual", 2, (context, [typeNameOrTemplate, f, ...args]) => {
      if (!realm.isPartial) {
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "realm is not partial")])
        );
      }

      let { type, template } = parseTypeNameOrTemplate(typeNameOrTemplate);

      if (f.constructor !== FunctionValue) {
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "cannot determine residual function")])
        );
      }
      invariant(f instanceof FunctionValue);
      f.isResidual = true;

      let types = new TypesDomain(type);
      let values = template ? new ValuesDomain(new Set([template])) : ValuesDomain.topVal;
      let result = realm.deriveAbstract(types, values, [f].concat(args), nodes => t.callExpression(nodes[0], ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>)));
      if (template) {
        template.makePartial();
        realm.rebuildNestedProperties(result, ((result.buildNode: any): BabelNodeIdentifier).name);
      }
      return result;
    }),
    writable: true,
    enumerable: false,
    configurable: true
  });

  // Helper function that annotates a function with a string. Useful for marking
  // certain developer-defined properties of the object (e.g. FACTORY_FUNCTION)
  obj.$DefineOwnProperty("__annotate", {
    value: new NativeFunctionValue(realm, "global.__annotate", "__annotate", 2, (context, [func, annotation]) => {
      // TODO: allow annotation of non-function values
      if (!(func instanceof FunctionValue)) {
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "cannot annotate non-function value")])
        );
      }

      if (!(annotation instanceof StringValue)) {
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "annotation must be a string")])
        );
      }
      context.$Realm.annotations.set(func, annotation.value);

      return context.$Realm.intrinsics.undefined;
    }),
    writable: true,
    enumerable: false,
    configurable: true
  });

  // Internal helper function for tests.
  // __isAbstract(value) checks if a given value is abstract.
  obj.$DefineOwnProperty("__isAbstract", {
    value: new NativeFunctionValue(realm, "global.__isAbstract", "__isAbstract", 1, (context, [value]) => {
      return new BooleanValue(realm, value instanceof AbstractValue);
    }),
    writable: true,
    enumerable: false,
    configurable: true
  });

  // __makePartial(object) marks an (abstract) object as partial.
  obj.$DefineOwnProperty("__makePartial", {
    value: new NativeFunctionValue(realm, "global.__makePartial", "__isPartial", 1, (context, [object]) => {
      // casting to any to avoid Flow bug
      if ((object: any) instanceof AbstractObjectValue || (object: any) instanceof ObjectValue) {
        (object: any).makePartial();
        return context.$Realm.intrinsics.undefined;
      }
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "not an (abstract) object")])
      );
    }),
    writable: true,
    enumerable: false,
    configurable: true
  });

  // __makeSimple(object) marks an (abstract) object as one that has no getters or setters.
  obj.$DefineOwnProperty("__makeSimple", {
    value: new NativeFunctionValue(realm, "global.__makeSimple", "__makeSimple", 1, (context, [object]) => {
      // casting to any to avoid Flow bug
      if ((object: any) instanceof AbstractObjectValue || (object: any) instanceof ObjectValue) {
        (object: any).makeSimple();
        return context.$Realm.intrinsics.undefined;
      }
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "not an (abstract) object")])
      );
    }),
    writable: true,
    enumerable: false,
    configurable: true
  });

  // Helper function that emits a check whether a given object property has a particular value.
  obj.$DefineOwnProperty("__assumeDataProperty", {
    value: new NativeFunctionValue(realm, "global.__assumeDataProperty", "__assumeDataProperty", 3, (context, [object, propertyName, value]) => {
      if (!realm.isPartial) {
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "realm is not partial")])
        );
      }

      let key = ToStringPartial(realm, propertyName);

      // casting to any to avoid Flow bug "*** Recursion limit exceeded ***"
      if ((object: any) instanceof AbstractObjectValue || (object: any) instanceof ObjectValue) {
        let generator = realm.generator;
        if (generator)
          generator.emitInvariant([object, value, object], ([objectNode, valueNode]) =>
            t.binaryExpression("!==", t.memberExpression(objectNode, t.identifier(key)), valueNode),
          (objnode) => t.memberExpression(objnode, t.identifier(key)));
        realm.generator = undefined; // don't emit code during the following $Set call
        // casting to due to Flow workaround above
        (object: any).$Set(key, value, object);
        realm.generator = generator;
        if (object.intrinsicName)
          realm.rebuildObjectProperty(object, key, value, object.intrinsicName);
        return context.$Realm.intrinsics.undefined;
      }

      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "not an (abstract) object")])
      );
    }),
    writable: true,
    enumerable: false,
    configurable: true
  });

  for (let name of [
    "undefined",
    "NaN",
    "Infinity"
  ]) {
    obj.$DefineOwnProperty(name, {
      value: realm.intrinsics[name],
      writable: false,
      enumerable: false,
      configurable: false
    });
  }
  let typeNames = [
    "String",
    "Object",
    "Function",
    "Array",
    "Number",
    "RegExp",
    "Date",
    "Math",
    "Error",
    "Function",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "EvalError",
    "Boolean",
    "DataView",
    "Float32Array",
    "Float64Array",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "Map",
    "WeakMap",
    "Set",
    "Uint8Array",
    "Uint8ClampedArray",
    "Uint16Array",
    "Uint32Array",
    "ArrayBuffer",
    "JSON",
    "__IntrospectionError"
  ];
  if (realm.compatibility !== "jsc")
    typeNames = typeNames.concat(
      "Symbol",
      "Promise",
      "WeakSet",
      "WeakMap",
      "Proxy",
      "Reflect",
    );
  for (let name of typeNames) {
    // need to check if the property exists (it may not due to --compatibility)
    if (realm.intrinsics[name]) {
      obj.$DefineOwnProperty(name, {
        value: realm.intrinsics[name],
        writable: true,
        enumerable: false,
        configurable: true
      });
    }
  }
  if (realm.compatibility === "jsc") {
    for (let name of [
      "window",
      "process",
      "setImmediate",
      "clearTimeout",
      "clearInterval",
      "clearImmediate",
      "alert",
      "navigator",
      "module",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "Symbol",
      "Promise",
      "WeakSet",
      "WeakMap",
      "Proxy",
      "WebSocket",
      "Request",
      "Response",
      "Headers",
      "FormData",
      "Worker",
      "Node",
      "Blob",
      "URLSearchParams",
      "FileReader",
      "XMLHttpRequest"
    ]) {
      obj.$DefineOwnProperty(name, {
        value: realm.intrinsics.undefined,
        writable: true,
        enumerable: false,
        configurable: true
      });
    }
  }

  for (let name of [
    "parseFloat",
    "parseInt",
    "console",
    "isNaN",
    "eval",
    "isFinite",
    "encodeURI",
    "decodeURI",
    "encodeURIComponent",
    "decodeURIComponent",
    "document"
  ]) {
    obj.$DefineOwnProperty(name, {
      value: realm.intrinsics[name],
      writable: true,
      enumerable: false,
      configurable: true
    });
  }

  return obj;
}
