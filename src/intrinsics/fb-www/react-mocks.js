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
import { parseExpression } from "@babel/parser";
import { ValuesDomain } from "../../domains/index.js";
import {
  AbstractObjectValue,
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  NativeFunctionValue,
  NullValue,
  NumberValue,
  ObjectValue,
  Value,
} from "../../values/index.js";
import { Environment } from "../../singletons.js";
import { createInternalReactElement, getReactSymbol } from "../../react/utils.js";
import { cloneReactElement, createReactElement } from "../../react/elements.js";
import { Properties, Create, To } from "../../singletons.js";
import invariant from "../../invariant.js";
import { updateIntrinsicNames, addMockFunctionToObject } from "./utils.js";
import { createOperationDescriptor } from "../../utils/generator.js";

// most of the code here was taken from https://github.com/facebook/react/blob/master/packages/react/src/ReactElement.js
let reactCode = `
  function createReact(
    REACT_ELEMENT_TYPE,
    REACT_FRAGMENT_TYPE,
    REACT_PORTAL_TYPE,
    REACT_FORWARD_REF_TYPE,
    ReactElement,
    ReactCurrentOwner
  ) {
    function makeEmptyFunction(arg) {
      return function() {
        return arg;
      };
    }
    var emptyFunction = function() {};

    emptyFunction.thatReturns = makeEmptyFunction;
    emptyFunction.thatReturnsFalse = makeEmptyFunction(false);
    emptyFunction.thatReturnsTrue = makeEmptyFunction(true);
    emptyFunction.thatReturnsNull = makeEmptyFunction(null);
    emptyFunction.thatReturnsThis = function() { return this; };
    emptyFunction.thatReturnsArgument = function(arg) { return arg; };

    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var RESERVED_PROPS = {
      key: true,
      ref: true,
      __self: true,
      __source: true,
    };

    function hasValidRef(config) {
      return config.ref !== undefined;
    }

    function hasValidKey(config) {
      return config.key !== undefined;
    }

    function Component(props, context) {
      this.props = props;
      this.context = context;
      this.refs = {};
      this.setState = function () {}; // NO-OP
      this.setState.__PREPACK_MOCK__ = true;
    }

    Component.prototype.isReactComponent = {};

    function PureComponent(props, context) {
      this.props = props;
      this.context = context;
      this.refs = {};
      this.setState = function () {}; // NO-OP
      this.setState.__PREPACK_MOCK__ = true;
    }

    PureComponent.prototype.isReactComponent = {};
    PureComponent.prototype.isPureReactComponent = true;

    function forwardRef(render) {
      // NOTE: In development there are a bunch of warnings which will be logged to validate the \`render\` function.
      // Since Prepack is a production only tool (for now) we don’t include these warnings.
      //
      // https://github.com/facebook/react/blob/f9358c51c8de93abe3cdd0f4720b489befad8c48/packages/react/src/forwardRef.js
      return {
        $$typeof: REACT_FORWARD_REF_TYPE,
        render,
      };
    }

    var userProvidedKeyEscapeRegex = /\/+/g;

    function escapeUserProvidedKey(text) {
      return ('' + text).replace(userProvidedKeyEscapeRegex, '$&/');
    }

    function escape(key) {
      const escapeRegex = /[=:]/g;
      const escaperLookup = {
        '=': '=0',
        ':': '=2',
      };
      const escapedString = ('' + key).replace(escapeRegex, function(match) {
        return escaperLookup[match];
      });

      return '$' + escapedString;
    }

    var SEPARATOR = '.';
    var SUBSEPARATOR = ':';
    var POOL_SIZE = 10;
    function getPooledTraverseContext(
      mapResult,
      keyPrefix,
      mapFunction,
      mapContext,
    ) {
      return {
        result: mapResult,
        keyPrefix: keyPrefix,
        func: mapFunction,
        context: mapContext,
        count: 0,
      };
    }

    function traverseAllChildren(children, callback, traverseContext) {
      if (children == null) {
        return 0;
      }

      return traverseAllChildrenImpl(children, '', callback, traverseContext);
    }

    function getComponentKey(component, index) {
      // Do some typechecking here since we call this blindly. We want to ensure
      // that we don't block potential future ES APIs.
      if (
        typeof component === 'object' &&
        component !== null &&
        component.key != null
      ) {
        // Explicit key
        return escape(component.key);
      }
      // Implicit key determined by the index in the set
      return index.toString(36);
    }

    function traverseAllChildrenImpl(
      children,
      nameSoFar,
      callback,
      traverseContext,
    ) {
      const type = typeof children;

      if (type === 'undefined' || type === 'boolean') {
        // All of the above are perceived as null.
        children = null;
      }

      let invokeCallback = false;

      if (children === null) {
        invokeCallback = true;
      } else {
        switch (type) {
          case 'string':
          case 'number':
            invokeCallback = true;
            break;
          case 'object':
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
            }
        }
      }

      if (invokeCallback) {
        callback(
          traverseContext,
          children,
          // If it's the only child, treat the name as if it was wrapped in an array
          // so that it's consistent if the number of children grows.
          nameSoFar === '' ? SEPARATOR + getComponentKey(children, 0) : nameSoFar,
        );
        return 1;
      }

      let child;
      let nextName;
      let subtreeCount = 0; // Count of children found in the current subtree.
      const nextNamePrefix =
        nameSoFar === '' ? SEPARATOR : nameSoFar + SUBSEPARATOR;

      if (Array.isArray(children)) {
        for (let i = 0; i < children.length; i++) {
          child = children[i];
          nextName = nextNamePrefix + getComponentKey(child, i);
          subtreeCount += traverseAllChildrenImpl(
            child,
            nextName,
            callback,
            traverseContext,
          );
        }
      } else {
        const iteratorFn = getIteratorFn(children);
        if (typeof iteratorFn === 'function') {
          var iterator = iteratorFn.call(children);
          let step;
          let ii = 0;
          while (!(step = iterator.next()).done) {
            child = step.value;
            nextName = nextNamePrefix + getComponentKey(child, ii++);
            subtreeCount += traverseAllChildrenImpl(
              child,
              nextName,
              callback,
              traverseContext,
            );
          }
        } else if (type === 'object') {
          let addendum = '';
          var childrenString = '' + children;
        }
      }

      return subtreeCount;
    }

    function cloneAndReplaceKey(oldElement, newKey) {
      var newElement = ReactElement(
        oldElement.type,
        newKey,
        oldElement.ref,
        oldElement.props,
      );
    
      return newElement;
    }

    function mapSingleChildIntoContext(bookKeeping, child, childKey) {
      var {result, keyPrefix, func, context} = bookKeeping;
    
      let mappedChild = func.call(context, child);
      if (Array.isArray(mappedChild)) {
        mapIntoWithKeyPrefixInternal(mappedChild, result, childKey, c => c);
      } else if (mappedChild != null) {
        if (isValidElement(mappedChild)) {
          mappedChild = cloneAndReplaceKey(
            mappedChild,
            // Keep both the (mapped) and old keys if they differ, just as
            // traverseAllChildren used to do for objects as children
            keyPrefix +
              (mappedChild.key && (!child || child.key !== mappedChild.key)
                ? escapeUserProvidedKey(mappedChild.key) + '/'
                : '') +
              childKey,
          );
        }
        result.push(mappedChild);
      }
    }

    function mapIntoWithKeyPrefixInternal(children, array, prefix, func, context) {
      var escapedPrefix = '';
      if (prefix != null) {
        escapedPrefix = escapeUserProvidedKey(prefix) + '/';
      }
      const traverseContext = getPooledTraverseContext(
        array,
        escapedPrefix,
        func,
        context,
      );
      traverseAllChildren(children, mapSingleChildIntoContext, traverseContext);
    }

    function forEachSingleChild(bookKeeping, child, name) {
      var {func, context} = bookKeeping;
      func.call(context, child);
    }

    function forEachChildren(children, forEachFunc, forEachContext) {
      if (children == null) {
        return children;
      }
      var traverseContext = getPooledTraverseContext(
        null,
        null,
        forEachFunc,
        forEachContext,
      );
      traverseAllChildren(children, forEachSingleChild, traverseContext);
    }

    function mapChildren(children, func, context) {
      if (children == null) {
        return children;
      }
      var result = [];
      mapIntoWithKeyPrefixInternal(children, result, null, func, context);
      return result;
    }

    function countChildren(children) {
      return traverseAllChildren(children, emptyFunction.thatReturnsNull, null);
    }

    function onlyChild(children) {
      return children;
    }

    function toArray(children) {
      var result = [];
      mapIntoWithKeyPrefixInternal(
        children,
        result,
        null,
        emptyFunction.thatReturnsArgument,
      );
      return result;
    }

    function isValidElement(object) {
      return (
        typeof object === 'object' &&
        object !== null &&
        object.$$typeof === REACT_ELEMENT_TYPE
      );
    }

    function shim() {

    }
    shim.isRequired = shim;

    function getShim() {
      return shim;
    };

    var ReactPropTypes = {
      array: shim,
      bool: shim,
      func: shim,
      number: shim,
      object: shim,
      string: shim,
      symbol: shim,

      any: shim,
      arrayOf: getShim,
      element: shim,
      instanceOf: getShim,
      node: shim,
      objectOf: getShim,
      oneOf: getShim,
      oneOfType: getShim,
      shape: getShim,
      exact: getShim
    };

    ReactPropTypes.checkPropTypes = shim;
    ReactPropTypes.PropTypes = ReactPropTypes;

    var ReactSharedInternals = {
      ReactCurrentOwner,
    };

    return {
      Children: {
        forEach: forEachChildren,
        map: mapChildren,
        count: countChildren,
        only: onlyChild,
        toArray,
      },
      Component,
      PureComponent,
      forwardRef,
      Fragment: REACT_FRAGMENT_TYPE,
      isValidElement,
      version: "16.2.0",
      PropTypes: ReactPropTypes,
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: ReactSharedInternals,
    };
  }
`;
let reactAst = parseExpression(reactCode, { plugins: ["flow"] });

export function createMockReact(realm: Realm, reactRequireName: string): ObjectValue {
  let reactFactory = Environment.GetValue(realm, realm.$GlobalEnv.evaluate(reactAst, false));
  invariant(reactFactory instanceof ECMAScriptSourceFunctionValue);

  let currentOwner = (realm.react.currentOwner = new ObjectValue(
    realm,
    realm.intrinsics.ObjectPrototype,
    "currentOwner"
  ));
  // this is to get around Flow getting confused
  let factory = reactFactory.$Call;
  invariant(factory !== undefined);

  let mockReactElementBuilder = new NativeFunctionValue(
    realm,
    undefined,
    "ReactElement",
    0,
    (context, [type, key, ref, props]) => {
      invariant(props instanceof ObjectValue);
      return createInternalReactElement(realm, type, key, ref, props);
    }
  );

  let reactValue = factory(realm.intrinsics.undefined, [
    getReactSymbol("react.element", realm),
    getReactSymbol("react.fragment", realm),
    getReactSymbol("react.portal", realm),
    getReactSymbol("react.forward_ref", realm),
    mockReactElementBuilder,
    currentOwner,
  ]);
  invariant(reactValue instanceof ObjectValue);
  reactValue.refuseSerialization = true;

  // update existing properties with the new intrinsic mock values
  updateIntrinsicNames(realm, reactValue, reactRequireName, [
    "PropTypes",
    "Children",
    "isValidElement",
    { name: "Component", updatePrototype: true },
    { name: "PureComponent", updatePrototype: true },
  ]);

  addMockFunctionToObject(
    realm,
    reactValue,
    reactRequireName,
    "createElement",
    (context, [type, config, ...children]) => {
      invariant(type instanceof Value);
      // if config is undefined/null, use an empy object
      if (config === realm.intrinsics.undefined || config === realm.intrinsics.null || config === undefined) {
        config = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
      }
      if (config instanceof AbstractValue && !(config instanceof AbstractObjectValue)) {
        config = To.ToObject(realm, config);
      }
      invariant(config instanceof ObjectValue || config instanceof AbstractObjectValue);

      if (Array.isArray(children)) {
        if (children.length === 0) {
          children = undefined;
        } else if (children.length === 1) {
          children = children[0];
        } else {
          let array = Create.ArrayCreate(realm, 0);
          let length = children.length;

          for (let i = 0; i < length; i++) {
            Create.CreateDataPropertyOrThrow(realm, array, "" + i, children[i]);
          }
          children = array;
          children.makeFinal();
        }
      }
      return createReactElement(realm, type, config, children);
    }
  );

  addMockFunctionToObject(
    realm,
    reactValue,
    reactRequireName,
    "cloneElement",
    (context, [element, config, ...children]) => {
      invariant(element instanceof ObjectValue);
      // if config is undefined/null, use an empy object
      if (config === realm.intrinsics.undefined || config === realm.intrinsics.null || config === undefined) {
        config = realm.intrinsics.null;
      }
      if (config instanceof AbstractValue && !(config instanceof AbstractObjectValue)) {
        config = To.ToObject(realm, config);
      }
      invariant(config instanceof ObjectValue || config instanceof AbstractObjectValue || config instanceof NullValue);

      if (Array.isArray(children)) {
        if (children.length === 0) {
          children = undefined;
        } else if (children.length === 1) {
          children = children[0];
        } else {
          let array = Create.ArrayCreate(realm, 0);
          let length = children.length;

          for (let i = 0; i < length; i++) {
            Create.CreateDataPropertyOrThrow(realm, array, "" + i, children[i]);
          }
          children = array;
          children.makeFinal();
        }
      }
      return cloneReactElement(realm, element, config, children);
    }
  );

  addMockFunctionToObject(
    realm,
    reactValue,
    reactRequireName,
    "createContext",
    (funcValue, [defaultValue = realm.intrinsics.undefined]) => {
      invariant(defaultValue instanceof Value);
      let consumerObject = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
      let providerObject = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
      let consumer = AbstractValue.createTemporalFromBuildFunction(
        realm,
        ObjectValue,
        [funcValue, defaultValue],
        createOperationDescriptor("REACT_TEMPORAL_FUNC"),
        { skipInvariant: true, isPure: true }
      );
      invariant(consumer instanceof AbstractObjectValue);
      consumer.values = new ValuesDomain(new Set([consumerObject]));

      let provider = AbstractValue.createTemporalFromBuildFunction(
        realm,
        ObjectValue,
        [consumer],
        createOperationDescriptor("REACT_CREATE_CONTEXT_PROVIDER"),
        { skipInvariant: true, isPure: true }
      );
      invariant(provider instanceof AbstractObjectValue);
      provider.values = new ValuesDomain(new Set([providerObject]));

      Properties.Set(realm, consumerObject, "$$typeof", getReactSymbol("react.context", realm), true);
      Properties.Set(realm, consumerObject, "currentValue", defaultValue, true);
      Properties.Set(realm, consumerObject, "defaultValue", defaultValue, true);
      Properties.Set(realm, consumerObject, "changedBits", new NumberValue(realm, 0), true);
      Properties.Set(realm, consumerObject, "Consumer", consumer, true);

      Properties.Set(realm, providerObject, "$$typeof", getReactSymbol("react.provider", realm), true);
      Properties.Set(realm, providerObject, "context", consumer, true);

      Properties.Set(realm, consumerObject, "Provider", provider, true);
      return consumer;
    }
  );

  addMockFunctionToObject(realm, reactValue, reactRequireName, "createRef", funcVal => {
    let createRef = AbstractValue.createTemporalFromBuildFunction(
      realm,
      FunctionValue,
      [funcVal],
      createOperationDescriptor("REACT_TEMPORAL_FUNC"),
      { skipInvariant: true, isPure: true }
    );
    invariant(createRef instanceof AbstractObjectValue);
    return createRef;
  });

  reactValue.refuseSerialization = false;
  reactValue.makeFinal();
  return reactValue;
}
