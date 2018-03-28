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
import { ObjectValue, NativeFunctionValue, FunctionValue } from "../../values/index.js";
import { Create } from "../../singletons.js";
import { createAbstract } from "../prepack/utils.js";
import * as t from "babel-types";
import { TypesDomain, ValuesDomain } from "../../domains/index.js";
import invariant from "../../invariant";
import { createReactHintObject } from "../../react/utils.js";

function createReactRelayContainer(realm: Realm, reactRelay: ObjectValue, containerName: string) {
  // we create a ReactRelay container function that returns an abstract object
  // allowing us to reconstruct this ReactReact.createSomeContainer(...) again
  // we also pass a reactHint so the reconciler can properly deal with this
  reactRelay.$DefineOwnProperty(containerName, {
    value: new NativeFunctionValue(realm, undefined, containerName, 0, (context, args) => {
      let types = new TypesDomain(FunctionValue);
      let values = new ValuesDomain();
      invariant(context.$Realm.generator);
      let value = context.$Realm.generator.derive(types, values, [reactRelay, ...args], _args => {
        let [reactRelayIdent, ...otherArgs] = _args;

        return t.callExpression(
          t.memberExpression(reactRelayIdent, t.identifier(containerName)),
          ((otherArgs: any): Array<any>)
        );
      });
      realm.react.abstractHints.set(value, createReactHintObject(reactRelay, containerName, args));
      return value;
    }),
    writable: false,
    enumerable: false,
    configurable: true,
  });
}

export function createMockReactRelay(realm: Realm, relayRequireName: string): ObjectValue {
  // we set refuseSerialization to true so we don't serialize the below properties straight away
  let reactRelay = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, `require("${relayRequireName}")`, true);
  // for QueryRenderer, we want to leave the component alone but process it's "render" prop
  let queryRendererComponent = createAbstract(realm, "function", `require("${relayRequireName}").QueryRenderer`);
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "QueryRenderer", queryRendererComponent);

  let graphql = createAbstract(realm, "function", `require("${relayRequireName}").graphql`);
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "graphql", graphql);

  let reactRelayContainers = ["createFragmentContainer", "createPaginationContainer", "createRefetchContainer"];
  for (let reactRelayContainer of reactRelayContainers) {
    createReactRelayContainer(realm, reactRelay, reactRelayContainer);
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
