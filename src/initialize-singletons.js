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
import { LeakImplementation, MaterializeImplementation } from "./utils/leak.js";
import { ReachabilityImplementation } from "./utils/reachability.js";
import { JoinImplementation } from "./methods/join.js";
import { PathConditionsImplementation, PathImplementation } from "./utils/paths.js";
import { PropertiesImplementation } from "./methods/properties.js";
import { ToImplementation } from "./methods/to.js";
import { WidenImplementation } from "./methods/widen.js";
import { concretize } from "./utils/ConcreteModelConverter.js";
import { DebugReproManagerImplementation } from "./utils/DebugReproManager.js";
import { PathConditions } from "./types";
import * as utils from "./utils.js";

export default function() {
  Singletons.setCreate(new CreateImplementation());
  Singletons.setEnvironment(new EnvironmentImplementation());
  Singletons.setFunctions(new FunctionImplementation());
  Singletons.setLeak(new LeakImplementation());
  Singletons.setMaterialize(new MaterializeImplementation());
  Singletons.setReachability(new ReachabilityImplementation());
  Singletons.setJoin(new JoinImplementation());
  Singletons.setPath(new PathImplementation());
  Singletons.setPathConditions((val: PathConditions | void) => new PathConditionsImplementation(val));
  Singletons.setProperties((new PropertiesImplementation(): any));
  Singletons.setTo((new ToImplementation(): any));
  Singletons.setWiden((new WidenImplementation(): any));
  Singletons.setConcretize(concretize);
  Singletons.setUtils(utils);
  Singletons.setDebugReproManager((new DebugReproManagerImplementation(): any));
}
