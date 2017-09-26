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
import { type Effects, type PropertyBindings, Realm } from "../realm.js";
import type { PropertyBinding } from "../types.js";
import { ignoreErrorsIn } from "../utils/errors.js";
import { AbstractObjectValue, FunctionValue, ObjectValue, UndefinedValue } from "../values/index.js";
import { ModuleTracer } from "./modules.js";
import buildTemplate from "babel-template";
import * as t from "babel-types";

export class Functions {
  constructor(realm: Realm, functions: ?Array<string>, moduleTracer: ModuleTracer) {
    this.realm = realm;
    this.functions = functions;
    this.moduleTracer = moduleTracer;
    this.writeEffects = new Map();
    this.nameToFunctionValue = new Map();
  }

  realm: Realm;
  functions: ?Array<string>;
  moduleTracer: ModuleTracer;
  writeEffects: Map<string, Effects>;
  nameToFunctionValue: Map<string, FunctionValue>;

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
          let e = ignoreErrorsIn(this.realm, () => this.realm.evaluateNodeForEffectsInGlobalEnv(fnameAst));
          fun = e ? e[0] : undefined;
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
      let funcLength = fun.getLength();
      if (funcLength && funcLength > 0) {
        // TODO #987: Make Additional Functions work with arguments
        throw new FatalError("TODO: implement arguments to additional functions");
      }
      this.nameToFunctionValue.set(fname, fun);
      let call = t.callExpression(fnameAst, []);
      calls.push([fname, call]);
    }

    // Get write effects of the functions
    for (let [fname, call] of calls) {
      // This may throw a FatalError if there is an unrecoverable error in the called function
      // When that happens we cannot prepack the bundle.
      // There may also be warnings reported for errors that happen inside imported modules that can be postponed.
      let e = this.realm.evaluateNodeForEffectsInGlobalEnv(call, this.moduleTracer);
      this.writeEffects.set(fname, e);
    }

    // check that functions are independent
    let conflicts: Map<BabelNodeSourceLocation, CompilerDiagnostic> = new Map();
    for (let [fname1, call1] of calls) {
      let e1 = this.writeEffects.get(fname1);
      invariant(e1 !== undefined);
      if (e1[0] instanceof Completion) {
        let error = new CompilerDiagnostic(
          `Additional function ${fname1} may terminate abruptly`,
          e1[0].location,
          "PP1002",
          "FatalError"
        );
        this.realm.handleError(error);
        throw new FatalError();
      } else if (!(e1[0] instanceof UndefinedValue)) {
        // TODO #988: Make Additional Functions work with return values
        throw new FatalError("TODO: make return values work with additional functions");
      }
      for (let [fname2, call2] of calls) {
        fname2; // not used
        if (call1 === call2) continue;
        this.reportWriteConflicts(fname1, conflicts, e1[3], call1, call2);
      }
    }
    if (conflicts.size > 0) {
      for (let diagnostic of conflicts.values()) this.realm.handleError(diagnostic);
      throw new FatalError();
    }
  }

  getAdditionalFunctionValuesToEffects(): Map<FunctionValue, Effects> {
    let functionValueToEffects = new Map();
    for (let [functionString, effects] of this.writeEffects.entries()) {
      let funcValue = this.nameToFunctionValue.get(functionString);
      invariant(funcValue);
      functionValueToEffects.set(funcValue, effects);
    }
    return functionValueToEffects;
  }

  reportWriteConflicts(
    fname: string,
    conflicts: Map<BabelNodeSourceLocation, CompilerDiagnostic>,
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
      conflicts.set(location, error);
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
      ignoreErrorsIn(this.realm, () => this.realm.evaluateNodeForEffectsInGlobalEnv(call2, this.moduleTracer));
    } finally {
      this.realm.reportPropertyAccess = oldReportPropertyAccess;
      this.realm.reportObjectGetOwnProperties = oldReportObjectGetOwnProperties;
    }
  }
}
