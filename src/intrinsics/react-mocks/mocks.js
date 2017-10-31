/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { parseExpression } from "babylon";

// this a mock of React.Component, to be used for tests
export function createMockReactComponent() {
  let componentCode = `
    class Component {
      constructor(props, context) {
        this.props = props || {};
        this.context = context || {};
        this.refs = {};
        this.state = {};
      }
      getChildContext() {}
    }
  `;
  return parseExpression(componentCode, { plugins: ["flow"] });
}

// this a mock of React.Component, to be used for tests
export function createMockReactCloneElement() {
  let cloneElementCode = `
  function cloneElement(element, config, children) {
    var propName;
    var RESERVED_PROPS = {
      key: true,
      ref: true,
      __self: true,
      __source: true,
    };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var props = Object.assign({}, element.props);
  
    var key = element.key;
    var ref = element.ref;
    var self = element._self;
    var source = element._source;
    var owner = element._owner;
  
    if (config != null) {
      if (config.ref !== undefined) {
        // owner = ReactCurrentOwner.current;
      }
      if (config.key !== undefined) {
        key = '' + config.key;
      }
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
  
    return {
      $$typeof: element.$$typeof,
      type: element.type,
      key: key,
      ref: ref,
      props: props,
      _owner: owner,
    };
  }
  `;
  return parseExpression(cloneElementCode, { plugins: ["flow"] });
}
