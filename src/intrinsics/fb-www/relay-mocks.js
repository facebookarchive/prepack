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
import { ObjectValue, AbstractValue, FunctionValue } from "../../values/index.js";
import { Create } from "../../singletons.js";
import buildExpressionTemplate from "../../utils/builder.js";

export function createMockReactRelay(realm: Realm, relayRequireName: string): ObjectValue {
  let reactRelay = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, `require("${relayRequireName}")`);
  // for QueryRenderer, we want to leave the component alone but process it's "render" prop
  let queryRendererComponent = AbstractValue.createTemporalFromTemplate(
    realm,
    buildExpressionTemplate(`require("${relayRequireName}").QueryRenderer`),
    FunctionValue,
    [],
    { isPure: true, skipInvariant: true }
  );
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "QueryRenderer", queryRendererComponent);

  let graphql = AbstractValue.createTemporalFromTemplate(
    realm,
    buildExpressionTemplate(`require("${relayRequireName}").graphql`),
    FunctionValue,
    [],
    { isPure: true, skipInvariant: true }
  );
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "graphql", graphql);

  let createFragmentContainer = AbstractValue.createTemporalFromTemplate(
    realm,
    buildExpressionTemplate(`require("${relayRequireName}").createFragmentContainer`),
    FunctionValue,
    [],
    { isPure: true, skipInvariant: true }
  );
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "createFragmentContainer", createFragmentContainer);

  let createPaginationContainer = AbstractValue.createTemporalFromTemplate(
    realm,
    buildExpressionTemplate(`require("${relayRequireName}").createPaginationContainer`),
    FunctionValue,
    [],
    { isPure: true, skipInvariant: true }
  );
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "createPaginationContainer", createPaginationContainer);

  let createRefetchContainer = AbstractValue.createTemporalFromTemplate(
    realm,
    buildExpressionTemplate(`require("${relayRequireName}").createRefetchContainer`),
    FunctionValue,
    [],
    { isPure: true, skipInvariant: true }
  );
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "createRefetchContainer", createRefetchContainer);

  return reactRelay;
}
