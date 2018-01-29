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
import { ObjectValue } from "../../values/index.js";
import { Create } from "../../singletons.js";
import { createAbstract } from "../prepack/utils.js";

export function createMockReactRelay(realm: Realm, relayRequireName: string): ObjectValue {
  let reactRelay = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, `require("${relayRequireName}")`);
  // for QueryRenderer, we want to leave the component alone but process it's "render" prop
  let queryRendererComponent = createAbstract(realm, "function", `require("${relayRequireName}").QueryRenderer`);
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "QueryRenderer", queryRendererComponent);

  let graphql = createAbstract(realm, "function", `require("${relayRequireName}").graphql`);
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "graphql", graphql);

  let createFragmentContainer = createAbstract(
    realm,
    "function",
    `require("${relayRequireName}").createFragmentContainer`
  );
  Create.CreateDataPropertyOrThrow(realm, reactRelay, "createFragmentContainer", createFragmentContainer);
  return reactRelay;
}
