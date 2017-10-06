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
import {
  AbstractObjectValue,
  FunctionValue,
  ObjectValue,
  type ECMAScriptSourceFunctionValue,
} from "../values/index.js";
import { ModuleTracer } from "./modules.js";
import buildTemplate from "babel-template";
import * as t from "babel-types";

export class Functions {
  constructor(
    realm: Realm,
    functions: ?Array<string>,
    moduleTracer: ModuleTracer,
    runtimeFunctions: Set<ECMAScriptSourceFunctionValue, string>
  ) {
    this.realm = realm;
    this.functions = functions;
    this.moduleTracer = moduleTracer;
    this.writeEffects = new Map();
    this.runtimeFunctions = runtimeFunctions;
    this.functionToString = new Map();
  }

  realm: Realm;
  functions: ?Array<string>;
  // maps back from FunctionValue to the expression string
  functionToString: Map<FunctionValue, string>;
  moduleTracer: ModuleTracer;
  writeEffects: Map<FunctionValue, Effects>;
  // additional functions specified with __registerAdditionalFunction at runtime
  runtimeFunctions: Map<ECMAScriptSourceFunctionValue, string>;

  checkThatFunctionsAreIndependent() {
    let functions = this.functions;
    invariant(
      functions || this.runtimeFunctions.size > 0,
      "This method should only be called if initialized with defined functions"
    );

    // lookup functions
    let calls = [];
    if (functions) {
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
        this.functionToString.set(fun, fname);
        let call = t.callExpression(fnameAst, []);
        calls.push([fun, call]);
      }
    }

    // The additional functions we registered at runtime are recorded at:
    // global.__additionalFunctions.id
    for (let [funcValue, funcId] of this.runtimeFunctions) {
      // TODO #987: make these properly have abstract arguments
      calls.push([
        funcValue,
        t.callExpression(
          t.memberExpression(
            t.memberExpression(t.identifier("global"), t.identifier("__additionalFunctions")),
            t.identifier("" + funcId)
          ),
          []
        ),
      ]);
    }

    // Get write effects of the functions
    for (let [fun, call] of calls) {
      // This may throw a FatalError if there is an unrecoverable error in the called function
      // When that happens we cannot prepack the bundle.
      // There may also be warnings reported for errors that happen inside imported modules that can be postponed.
      let e = this.realm.evaluateNodeForEffectsInGlobalEnv(call, this.moduleTracer);
      this.writeEffects.set(fun, e);
    }

    // check that functions are independent
    let conflicts: Map<BabelNodeSourceLocation, CompilerDiagnostic> = new Map();
    for (let [fun1, call1] of calls) {
      // Also do argument valudation here
      let funcLength = fun1.getLength();
      if (funcLength && funcLength > 0) {
        // TODO #987: Make Additional Functions work with arguments
        throw new FatalError("TODO: implement arguments to additional functions");
      }
      let e1 = this.writeEffects.get(fun1);
      invariant(e1 !== undefined);
      let fun1Name = this.functionToString.get(fun1) || fun1.intrinsicName;
      if (e1[0] instanceof Completion) {
        let error = new CompilerDiagnostic(
          `Additional function ${fun1Name} may terminate abruptly`,
          e1[0].location,
          "PP1002",
          "FatalError"
        );
        this.realm.handleError(error);
        throw new FatalError();
      }
      for (let [, call2] of calls) {
        if (call1 === call2) continue;
        this.reportWriteConflicts(fun1Name, conflicts, e1[3], call1, call2);
      }
    }
    if (conflicts.size > 0) {
      for (let diagnostic of conflicts.values()) this.realm.handleError(diagnostic);
      throw new FatalError();
    }
  }

  getAdditionalFunctionValuesToEffects(): Map<FunctionValue, Effects> {
    return this.writeEffects;
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
