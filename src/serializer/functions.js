/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeCallExpression, BabelNodeIdentifier, BabelNodeSourceLocation } from "babel-types";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import invariant from "../invariant.js";
import { type PropertyBindings, Realm } from "../realm.js";
import type { PropertyBinding } from "../types.js";
import { FunctionValue, Value } from "../values/index.js";
import * as t from "babel-types";

export class Functions {
  constructor(realm: Realm, functions: ?Array<string>) {
    this.realm = realm;
    this.functions = functions;
  }

  realm: Realm;
  functions: ?Array<string>;

  checkThatFunctionsAreIndependent() {
    let functions = this.functions;
    invariant(functions, "This method should only be called if initialized with defined functions");

    // lookup functions
    let calls = [];
    let glob = this.realm.$GlobalObject;
    for (let fname of functions) {
      let fun = glob.$Get(fname, glob);
      if (!(fun instanceof FunctionValue)) {
        let error = new CompilerDiagnostic(
          `Additional function ${fname} not defined in the global object`,
          null,
          "PP1001",
          "FatalError"
        );
        this.realm.handleError(error);
        throw new FatalError();
      }
      let callee = t.identifier(fname);
      let call = t.callExpression(callee, []);
      calls.push(call);
    }

    // check that functions are independent
    let conflicts: Set<BabelNodeSourceLocation> = new Set();
    for (let call1 of calls) {
      let e1 = this.realm.evaluateNodeForEffectsInGlobalEnv(call1);
      if (!(e1[0] instanceof Value)) {
        let fname = ((call1.callee: any): BabelNodeIdentifier).name;
        let error = new CompilerDiagnostic(
          `Additional function ${fname} may terminate abruptly`,
          null,
          "PP1002",
          "FatalError"
        );
        this.realm.handleError(error);
        throw new FatalError();
      }
      for (let call2 of calls) {
        if (call1 === call2) continue;
        this.reportWriteConflicts(conflicts, e1[3], call1, call2);
      }
    }
    if (conflicts.size > 0) throw new FatalError();
  }

  reportWriteConflicts(
    conflicts: Set<BabelNodeSourceLocation>,
    pbs: PropertyBindings,
    call1: BabelNodeCallExpression,
    call2: BabelNodeCallExpression
  ) {
    let fname = "";
    let oldReporter = this.realm.reportPropertyAccess;
    this.realm.reportPropertyAccess = (pb: PropertyBinding) => {
      let location = this.realm.currentLocation;
      if (!location) return; // happens only when accessing an additional function property
      if (pbs.has(pb) && !conflicts.has(location)) {
        let error = new CompilerDiagnostic(
          `Property access conflicts with write in additional function ${fname}`,
          location,
          "PP1003",
          "FatalError"
        );
        this.realm.handleError(error);
        conflicts.add(location);
      }
    };
    try {
      fname = ((call1.callee: any): BabelNodeIdentifier).name;
      this.realm.evaluateNodeForEffectsInGlobalEnv(call2);
    } finally {
      this.realm.reportPropertyAccess = oldReporter;
    }
  }
}
