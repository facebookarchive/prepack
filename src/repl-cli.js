/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm, ExecutionContext } from "./realm.js";
import { FatalError } from "./errors.js";
import { Get } from "./methods/index.js";
import { InstanceofOperator } from "./methods/index.js";
import { AbruptCompletion, ThrowCompletion } from "./completions.js";
import { Value, ObjectValue } from "./values/index.js";
import { To } from "./singletons.js";
import construct_realm from "./construct_realm.js";
import initializeGlobals from "./globals.js";
import repl from "repl";

function serialize(realm: Realm, res: Value | AbruptCompletion): any {
  if (res && res instanceof Value) {
    return res.serialize();
  }

  if (res && res instanceof ThrowCompletion) {
    let context = new ExecutionContext();
    realm.pushContext(context);
    let err;
    try {
      let value = res.value;
      if (value instanceof ObjectValue && InstanceofOperator(realm, value, realm.intrinsics.Error)) {
        err = new FatalError(To.ToStringPartial(realm, Get(realm, value, "message")));
        err.stack = To.ToStringPartial(realm, Get(realm, value, "stack"));
      } else {
        err = new FatalError(To.ToStringPartial(realm, value));
      }
    } finally {
      realm.popContext(context);
    }
    return err;
  }

  return res;
}

let realm = construct_realm({
  reactEnabled: true,
  reactOutput: "jsx",
});
initializeGlobals(realm);

repl.start({
  prompt: "> ",
  input: process.stdin,
  output: process.stdout,
  eval(code, context, filename, callback) {
    try {
      let res = realm.$GlobalEnv.execute(code, "repl");
      res = serialize(realm, res);
      if (res instanceof Error) {
        callback(res);
      } else {
        callback(null, res);
      }
    } catch (err) {
      console.error(err);
      callback(err);
    }
  },
});
