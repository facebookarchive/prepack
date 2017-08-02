/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeCallExpression, BabelNodeSourceLocation } from "babel-types";
import { Completion, ThrowCompletion } from "../completions.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import invariant from "../invariant.js";
import { type PropertyBindings, Realm } from "../realm.js";
import type { PropertyBinding } from "../types.js";
import { AbstractObjectValue, FunctionValue, ObjectValue } from "../values/index.js";
import buildTemplate from "babel-template";
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
    for (let fname of functions) {
      let fun;
      let fnameAst = buildTemplate(fname)({}).expression;
      if (fnameAst) {
        try {
          let e = this.realm.evaluateNodeForEffectsInGlobalEnv(fnameAst);
          fun = e[0];
        } catch (ex) {
          if (!(ex instanceof ThrowCompletion)) throw ex;
        }
      }
      if (!(fun instanceof FunctionValue)) {
        let error = new CompilerDiagnostic(
          `Additional function ${fname} not defined in the global environment`,
          null,
          "PP1001",
          "FatalError"
        );
        this.realm.handleError(error);
        throw new FatalError();
      }
      let call = t.callExpression(fnameAst, []);
      calls.push([fname, call]);
    }

    // check that functions are independent
    let conflicts: Set<BabelNodeSourceLocation> = new Set();
    for (let [fname1, call1] of calls) {
      let e1 = this.realm.evaluateNodeForEffectsInGlobalEnv(call1);
      let c = e1[0];
      if (c instanceof Completion) {
        let error = new CompilerDiagnostic(
          `Additional function ${fname1} may terminate abruptly`,
          c.location,
          "PP1002",
          "FatalError"
        );
        this.realm.handleError(error);
        throw new FatalError();
      }
      for (let [fname2, call2] of calls) {
        fname2; // not used
        if (call1 === call2) continue;
        this.reportWriteConflicts(fname1, conflicts, e1[3], call1, call2);
      }
    }
    if (conflicts.size > 0) throw new FatalError();
  }

  reportWriteConflicts(
    fname: string,
    conflicts: Set<BabelNodeSourceLocation>,
    pbs: PropertyBindings,
    call1: BabelNodeCallExpression,
    call2: BabelNodeCallExpression
  ) {
    let reportConflict = (location: BabelNodeSourceLocation) => {
      let error = new CompilerDiagnostic(
        `Property access conflicts with write in additional function ${fname}`,
        location,
        "PP1003",
        "FatalError"
      );
      this.realm.handleError(error);
      conflicts.add(location);
    };
    let writtenObjects: Set<ObjectValue | AbstractObjectValue> = new Set();
    pbs.forEach((val, key, m) => {
      writtenObjects.add(key.object);
    });
    let oldReportObjectGetOwnProperties = this.realm.reportObjectGetOwnProperties;
    this.realm.reportObjectGetOwnProperties = (ob: ObjectValue) => {
      let location = this.realm.currentLocation;
      invariant(location);
      if (writtenObjects.has(ob) && !conflicts.has(location)) reportConflict(location);
    };
    let oldReportPropertyAccess = this.realm.reportPropertyAccess;
    this.realm.reportPropertyAccess = (pb: PropertyBinding) => {
      let location = this.realm.currentLocation;
      if (!location) return; // happens only when accessing an additional function property
      if (pbs.has(pb) && !conflicts.has(location)) reportConflict(location);
    };
    try {
      this.realm.evaluateNodeForEffectsInGlobalEnv(call2);
    } finally {
      this.realm.reportPropertyAccess = oldReportPropertyAccess;
      this.realm.reportObjectGetOwnProperties = oldReportObjectGetOwnProperties;
    }
  }
}
