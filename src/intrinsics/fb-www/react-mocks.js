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
import { parseExpression } from "babylon";
import { ValuesDomain } from "../../domains/index.js";
import {
  ObjectValue,
  ECMAScriptSourceFunctionValue,
  Value,
  AbstractObjectValue,
  AbstractValue,
  FunctionValue,
  NumberValue,
} from "../../values/index.js";
import { Environment } from "../../singletons.js";
import { createReactHintObject, getReactSymbol } from "../../react/utils.js";
import { createReactElement } from "../../react/elements.js";
import { Properties, Create, To } from "../../singletons.js";
import * as t from "babel-types";
import invariant from "../../invariant";
import { updateIntrinsicNames, addMockFunctionToObject } from "./utils.js";

// most of the code here was taken from https://github.com/facebook/react/blob/master/packages/react/src/ReactElement.js
let reactCode = `
  function createReact(REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, REACT_PORTAL_TYPE, ReactCurrentOwner) {
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

    var ReactElement = function(type, key, ref, self, source, owner, props) {
      return {
        // This tag allow us to uniquely identify this as a React Element
        $$typeof: REACT_ELEMENT_TYPE,
    
        // Built-in properties that belong on the element
        type: type,
        key: key,
        ref: ref,
        props: props,
    
        // Record the component responsible for creating this element.
        _owner: owner,
      };
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
    var traverseContextPool = [];
    function getPooledTraverseContext(
      mapResult,
      keyPrefix,
      mapFunction,
      mapContext,
    ) {
      if (traverseContextPool.length) {
        const traverseContext = traverseContextPool.pop();
        traverseContext.result = mapResult;
        traverseContext.keyPrefix = keyPrefix;
        traverseContext.func = mapFunction;
        traverseContext.context = mapContext;
        traverseContext.count = 0;
        return traverseContext;
      } else {
        return {
          result: mapResult,
          keyPrefix: keyPrefix,
          func: mapFunction,
          context: mapContext,
          count: 0,
        };
      }
    }

    function releaseTraverseContext(traverseContext) {
      traverseContext.result = null;
      traverseContext.keyPrefix = null;
      traverseContext.func = null;
      traverseContext.context = null;
      traverseContext.count = 0;
      if (traverseContextPool.length < POOL_SIZE) {
        traverseContextPool.push(traverseContext);
      }
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
      releaseTraverseContext(traverseContext);
    }

    function forEachSingleChild(bookKeeping, child, name) {
      const {func, context} = bookKeeping;
      func.call(context, child, bookKeeping.count++);
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
      releaseTraverseContext(traverseContext);
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

    function cloneElement(element, config, children) {
      var propName;
      
      // Original props are copied
      var props = Object.assign({}, element.props);
    
      // Reserved names are extracted
      var key = element.key;
      var ref = element.ref;
      // Self is preserved since the owner is preserved.
      var self = element._self;
      // Source is preserved since cloneElement is unlikely to be targeted by a
      // transpiler, and the original source is probably a better indicator of the
      // true owner.
      var source = element._source;
    
      // Owner will be preserved, unless ref is overridden
      var owner = element._owner;
    
      if (config != null) {
        if (hasValidRef(config)) {
          // Silently steal the ref from the parent.
          ref = config.ref;
          owner = ReactCurrentOwner.current;
        }
        if (hasValidKey(config)) {
          key = '' + config.key;
        }
    
        // Remaining properties override existing props
        var defaultProps;
        if (element.type && element.type.defaultProps) {
          defaultProps = element.type.defaultProps;
        }
        for (propName in config) {
          if (
            hasOwnProperty.call(config, propName) &&
            !RESERVED_PROPS.hasOwnProperty(propName)
          ) {
            if (config[propName] === undefined && defaultProps !== undefined) {
              // Resolve default props
              props[propName] = defaultProps[propName];
            } else {
              props[propName] = config[propName];
            }
          }
        }
      }
    
      // Children can be more than one argument, and those are transferred onto
      // the newly allocated props object.
      var childrenLength = arguments.length - 2;
      if (childrenLength === 1) {
        props.children = children;
      } else if (childrenLength > 1) {
        var childArray = new Array(childrenLength);
        for (var i = 0; i < childrenLength; i++) {
          childArray[i] = arguments[i + 2];
        }
        props.children = childArray;
      }
    
      return ReactElement(element.type, key, ref, self, source, owner, props);
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
      Fragment: REACT_FRAGMENT_TYPE,
      cloneElement,
      isValidElement,
      version: "16.2.0",
      PropTypes: ReactPropTypes,
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

  let reactValue = factory(realm.intrinsics.undefined, [
    getReactSymbol("react.element", realm),
    getReactSymbol("react.fragment", realm),
    getReactSymbol("react.portal", realm),
    currentOwner,
  ]);
  invariant(reactValue instanceof ObjectValue);
  reactValue.refuseSerialization = true;

  // update existing properties with the new intrinsic mock values
  updateIntrinsicNames(realm, reactValue, reactRequireName, [
    "PropTypes",
    "Children",
    "isValidElement",
    "cloneElement",
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
    "createContext",
    (funcValue, [defaultValue = realm.intrinsics.undefined]) => {
      invariant(defaultValue instanceof Value);
      let consumerObject = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
      let providerObject = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
      let consumer = AbstractValue.createTemporalFromBuildFunction(
        realm,
        ObjectValue,
        [funcValue, defaultValue],
        ([methodNode, defaultValueNode]) => t.callExpression(methodNode, [defaultValueNode]),
        { skipInvariant: true, isPure: true }
      );
      invariant(consumer instanceof AbstractObjectValue);
      consumer.values = new ValuesDomain(new Set([consumerObject]));

      let provider = AbstractValue.createTemporalFromBuildFunction(
        realm,
        ObjectValue,
        [consumer],
        ([consumerNode]) => t.memberExpression(consumerNode, t.identifier("Provider")),
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
      ([createRefNode]) => {
        return t.callExpression(createRefNode, []);
      },
      { skipInvariant: true, isPure: true }
    );
    invariant(createRef instanceof AbstractObjectValue);
    return createRef;
  });

  addMockFunctionToObject(realm, reactValue, reactRequireName, "forwardRef", (funcVal, [func]) => {
    let forwardedRef = AbstractValue.createTemporalFromBuildFunction(
      realm,
      FunctionValue,
      [funcVal, func],
      ([forwardRefNode, funcNode]) => {
        return t.callExpression(forwardRefNode, [funcNode]);
      },
      { skipInvariant: true, isPure: true }
    );
    invariant(forwardedRef instanceof AbstractObjectValue);
    realm.react.abstractHints.set(
      forwardedRef,
      createReactHintObject(reactValue, "forwardRef", [func], realm.intrinsics.undefined)
    );
    return forwardedRef;
  });

  reactValue.refuseSerialization = false;
  reactValue.makeFinal();
  return reactValue;
}
