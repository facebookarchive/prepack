/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeCallExpression, BabelNodeIdentifier } from "babel-types";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import invariant from "../invariant.js";
import { intersectBindings } from "../methods/join.js";
import { type PropertyBindings, Realm } from "../realm.js";
import type { PropertyBinding } from "../types.js";
import { EmptyValue, FunctionValue, Value } from "../values/index.js";
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
        let e2 = this.realm.evaluateNodeForEffectsInGlobalEnv(call2);
        if (!(e2[0] instanceof Value)) continue; // will report error in outer loop
        let e3 = intersectBindings(this.realm, e1, e2);
        let hasWriteConflicts = false;
        for (let pb of e3[3].values()) {
          invariant(pb !== undefined); // guaranteed by intersectBindings
          if (pb.value instanceof EmptyValue) {
            hasWriteConflicts = true;
            break;
          }
        }
        if (hasWriteConflicts) this.reportWriteConflicts(e3[3], call1, call2);
      }
    }
  }

  reportWriteConflicts(pbs: PropertyBindings, call1: BabelNodeCallExpression, call2: BabelNodeCallExpression) {
    let fname = "";
    let oldReporter = this.realm.reportPropertyModification;
    this.realm.reportPropertyModification = (pb: PropertyBinding) => {
      if (pbs.has(pb)) {
        let error = new CompilerDiagnostic(
          `Property write conflicts with write in additional function ${fname}`,
          this.realm.currentLocation,
          "PP1003",
          "FatalError"
        );
        this.realm.handleError(error);
      }
    };
    try {
      fname = ((call2.callee: any): BabelNodeIdentifier).name;
      this.realm.evaluateNodeForEffectsInGlobalEnv(call1);
      fname = ((call1.callee: any): BabelNodeIdentifier).name;
      this.realm.evaluateNodeForEffectsInGlobalEnv(call2);
    } finally {
      this.realm.reportPropertyModification = oldReporter;
    }
    throw new FatalError();
  }
}
