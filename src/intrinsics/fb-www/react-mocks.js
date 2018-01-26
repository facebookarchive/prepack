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
import { ObjectValue, ECMAScriptFunctionValue, ECMAScriptSourceFunctionValue } from "../../values/index.js";
import { Get } from "../../methods/index.js";
import { Environment } from "../../singletons.js";
import { getReactSymbol } from "../../react/utils.js";
import invariant from "../../invariant";

// most of the code here was taken from https://github.com/facebook/react/blob/master/packages/react/src/ReactElement.js
let reactCode = `
  function createReact(REACT_ELEMENT_TYPE, REACT_SYMBOL_TYPE, ReactCurrentOwner) {
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

    class Component {
      constructor(props, context) {
        this.props = props;
        this.context = context;
        this.refs = {};
      }
      getChildContext() {}
    }

    Component.prototype.isReactComponent = {};

    class PureComponent {
      constructor(props, context) {
        this.props = props;
        this.context = context;
        this.refs = {};
      }
    }

    PureComponent.prototype.isReactComponent = {};
    PureComponent.prototype.isPureReactComponent = true;

    function forEachChildren() {
      throw new Error("TODO: React.Children.forEach is not yet supported");
    }

    function mapChildren() {
      throw new Error("TODO: React.Children.map is not yet supported");
    }

    function countChildren() {
      throw new Error("TODO: React.Children.count is not yet supported");
    }

    function onlyChild() {
      throw new Error("TODO: React.Children.only is not yet supported");
    }

    function toArray() {
      throw new Error("TODO: React.Children.toArray is not yet supported");
    }

    function createElement(type, config, children) {
      var propName;

      // Reserved names are extracted
      var props = {};

      var key = null;
      var ref = null;
      var self = null;
      var source = null;

      if (config != null) {
        if (hasValidRef(config)) {
          ref = config.ref;
        }
        if (hasValidKey(config)) {
          key = '' + config.key;
        }
    
        self = config.__self === undefined ? null : config.__self;
        source = config.__source === undefined ? null : config.__source;
        // Remaining properties are added to a new props object
        for (propName in config) {
          if (
            hasOwnProperty.call(config, propName) &&
            !RESERVED_PROPS.hasOwnProperty(propName)
          ) {
            props[propName] = config[propName];
          }
        }
      }

      // Children can be more than one argument, and those are transferred onto
      // the newly allocated props object.
      var childrenLength = arguments.length - 2;
      if (childrenLength === 1) {
        props.children = children;
      } else if (childrenLength > 1) {
        var childArray = Array(childrenLength);
        for (var i = 0; i < childrenLength; i++) {
          childArray[i] = arguments[i + 2];
        }
        props.children = childArray;
      }
    
      // Resolve default props
      if (type && type.defaultProps) {
        var defaultProps = type.defaultProps;
        for (propName in defaultProps) {
          if (props[propName] === undefined) {
            props[propName] = defaultProps[propName];
          }
        }
      }
    
      return ReactElement(
        type,
        key,
        ref,
        self,
        source,
        ReactCurrentOwner.current,
        props,
      );
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
        var childArray = Array(childrenLength);
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
      Fragment: REACT_SYMBOL_TYPE,
      createElement,
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
    getReactSymbol("react.symbol", realm),
    currentOwner,
  ]);
  reactValue.intrinsicName = `require("${reactRequireName}")`;
  invariant(reactValue instanceof ObjectValue);

  let reactComponentValue = Get(realm, reactValue, "Component");
  reactComponentValue.intrinsicName = `require("${reactRequireName}").Component`;
  invariant(reactComponentValue instanceof ECMAScriptFunctionValue);
  let reactPureComponentValue = Get(realm, reactValue, "PureComponent");
  reactPureComponentValue.intrinsicName = `require("${reactRequireName}").PureComponent`;
  invariant(reactPureComponentValue instanceof ECMAScriptFunctionValue);
  reactComponentValue.$FunctionKind = "normal";
  invariant(reactComponentValue instanceof ObjectValue);

  let reactComponentPrototypeValue = Get(realm, reactComponentValue, "prototype");
  reactComponentPrototypeValue.intrinsicName = `require("${reactRequireName}").Component.prototype`;

  let reactPureComponentPrototypeValue = Get(realm, reactPureComponentValue, "prototype");
  reactPureComponentPrototypeValue.intrinsicName = `require("${reactRequireName}").PureComponent.prototype`;

  let reactCloneElementValue = Get(realm, reactValue, "cloneElement");
  reactCloneElementValue.intrinsicName = `require("${reactRequireName}").cloneElement`;

  let reactCreateElementValue = Get(realm, reactValue, "createElement");
  reactCreateElementValue.intrinsicName = `require("${reactRequireName}").createElement`;

  let reactIsValidElementValue = Get(realm, reactValue, "isValidElement");
  reactIsValidElementValue.intrinsicName = `require("${reactRequireName}").isValidElement`;

  let reactChildrenValue = Get(realm, reactValue, "Children");
  reactChildrenValue.intrinsicName = `require("${reactRequireName}").Children`;

  return reactValue;
}
