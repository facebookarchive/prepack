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
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  ObjectValue,
  StringValue,
} from "../../values/index.js";
import { Create, Environment } from "../../singletons.js";
import { createAbstract } from "../prepack/utils.js";
import { Get } from "../../methods/index.js";
import invariant from "../../invariant.js";
import { createReactHintObject } from "../../react/utils.js";
import { parseExpression } from "@babel/parser";
import { addMockFunctionToObject } from "./utils.js";
import { createOperationDescriptor } from "../../utils/generator.js";

let reactRelayCode = `
  function createReactRelay(React) {

   function mapObject(obj, func) {
     var newObj = {};

      Object.keys(obj).forEach(function(key) {
        newObj[key] = func(obj[key]);
      });

      return newObj;
   }

    function isReactComponent(component) {
      return !!(
        component &&
        typeof component.prototype === 'object' &&
        component.prototype &&
        component.prototype.isReactComponent
      );
    }

    function getReactComponent(Component) {
      if (isReactComponent(Component)) {
        return Component;
      } else {
        return null;
      }
    }

    function getComponentName(Component) {
      let name;
      const ComponentClass = getReactComponent(Component);
      if (ComponentClass) {
        name = ComponentClass.displayName || ComponentClass.name;
      } else if (typeof Component === 'function') {
        name = Component.displayName || Component.name || 'StatelessComponent';
      } else {
        name = 'ReactElement';
      }
      return String(name);
    }

    function createFragmentContainer(Component, fragmentSpec) {
      var componentName = getComponentName(Component);
      var containerName = \`Relay(\${componentName})\`;

      return function(props, context) {
        var relay = context.relay;
        var {
          createFragmentSpecResolver,
          getFragment: getFragmentFromTag,
        } = relay.environment.unstable_internal;
        var fragments = mapObject(fragmentSpec, getFragmentFromTag);
        var resolver = createFragmentSpecResolver(
          relay,
          containerName,
          fragments,
          props,
        );
        var relayProp = {
          isLoading: resolver.isLoading(),
          environment: relay.environment,
        };
        var newProps = Object.assign({}, props, resolver.resolve(), {
          relay: relayProp,
        });
        return React.createElement(Component, newProps);
      };
    }

    return {
      createFragmentContainer,
    };
  }
`;
let reactRelayAst = parseExpression(reactRelayCode, { plugins: ["flow"] });

function createReactRelayContainer(
  realm: Realm,
  reactRelay: ObjectValue,
  containerName: string,
  reactRelayFirstRenderValue: ObjectValue,
  relayRequireName: string
) {
  // we create a ReactRelay container function that returns an abstract object
  // allowing us to reconstruct this ReactReact.createSomeContainer(...) again
  // we also pass a reactHint so the reconciler can properly deal with this
  addMockFunctionToObject(realm, reactRelay, relayRequireName, containerName, (funcValue, args) => {
    let value = AbstractValue.createTemporalFromBuildFunction(
      realm,
      FunctionValue,
      [reactRelay, new StringValue(realm, containerName), ...args],
      createOperationDescriptor("REACT_RELAY_MOCK_CONTAINER"),
      { skipInvariant: true, isPure: true }
    );
    invariant(value instanceof AbstractValue);
    let firstRenderContainerValue = Get(realm, reactRelayFirstRenderValue, containerName);
    let firstRenderValue = realm.intrinsics.undefined;

    if (firstRenderContainerValue instanceof ECMAScriptSourceFunctionValue) {
      let firstRenderContainerValueCall = firstRenderContainerValue.$Call;
      invariant(firstRenderContainerValueCall !== undefined);
      firstRenderValue = firstRenderContainerValueCall(realm.intrinsics.undefined, args);
      invariant(firstRenderValue instanceof ECMAScriptSourceFunctionValue);
    }

    realm.react.abstractHints.set(value, createReactHintObject(reactRelay, containerName, args, firstRenderValue));
    return value;
  });
}

export function createMockReactRelay(realm: Realm, relayRequireName: string): ObjectValue {
  let reactRelayFirstRenderFactory = Environment.GetValue(realm, realm.$GlobalEnv.evaluate(reactRelayAst, false));
  invariant(reactRelayFirstRenderFactory instanceof ECMAScriptSourceFunctionValue);
  let factory = reactRelayFirstRenderFactory.$Call;
  invariant(factory !== undefined);
  invariant(realm.fbLibraries.react instanceof ObjectValue, "mock ReactRelay cannot be required before mock React");
  let reactRelayFirstRenderValue = factory(realm.intrinsics.undefined, [realm.fbLibraries.react]);
  invariant(reactRelayFirstRenderValue instanceof ObjectValue);

  // we set refuseSerialization to true so we don't serialize the below properties straight away
  let reactRelay = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, `require("${relayRequireName}")`, true);
  // for QueryRenderer, we want to leave the component alone but process it's "render" prop
  let queryRendererComponent = createAbstract(realm, "function", `require("${relayRequireName}").QueryRenderer`);
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "QueryRenderer", queryRendererComponent);

  let graphql = createAbstract(realm, "function", `require("${relayRequireName}").graphql`);
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "graphql", graphql);

  let reactRelayContainers = ["createFragmentContainer", "createPaginationContainer", "createRefetchContainer"];
  for (let reactRelayContainer of reactRelayContainers) {
    createReactRelayContainer(realm, reactRelay, reactRelayContainer, reactRelayFirstRenderValue, relayRequireName);
  }

  let commitLocalUpdate = createAbstract(realm, "function", `require("${relayRequireName}").commitLocalUpdate`);
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "commitLocalUpdate", commitLocalUpdate);

  let commitMutation = createAbstract(realm, "function", `require("${relayRequireName}").commitMutation`);
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "commitMutation", commitMutation);

  let fetchQuery = createAbstract(realm, "function", `require("${relayRequireName}").fetchQuery`);
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "fetchQuery", fetchQuery);

  let requestSubscription = createAbstract(realm, "function", `require("${relayRequireName}").requestSubscription`);
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "requestSubscription", requestSubscription);

  // we set refuseSerialization back to false
  reactRelay.refuseSerialization = false;
  reactRelay.makeFinal();
  return reactRelay;
}
