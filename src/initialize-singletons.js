/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import * as Singletons from "./singletons.js";
import { CreateImplementation } from "./methods/create.js";
import { EnvironmentImplementation } from "./methods/environment.js";
import { FunctionImplementation } from "./methods/function.js";
import { JoinImplementation } from "./methods/join.js";
import { PathImplementation } from "./utils/paths.js";
import { PropertiesImplementation } from "./methods/properties.js";

export default function() {
  Singletons.setCreate(new CreateImplementation());
  Singletons.setEnvironment(new EnvironmentImplementation());
  Singletons.setFunctions(new FunctionImplementation());
  Singletons.setJoin(new JoinImplementation());
  Singletons.setPath(new PathImplementation());
  Singletons.setProperties((new PropertiesImplementation(): any));
}
