/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import {
  AbruptCompletion,
  Completion,
  JoinedAbruptCompletions,
  PossiblyNormalCompletion,
  ReturnCompletion,
  ThrowCompletion,
} from "../completions.js";
import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { AbstractValue, ObjectValue, StringValue, Value, EmptyValue } from "../values/index.js";
import { GlobalEnvironmentRecord } from "../environment.js";
import { Environment, Functions, Join } from "../singletons.js";
import IsStrict from "../utils/strict.js";
import invariant from "../invariant.js";
import traverseFast from "../utils/traverse-fast.js";
import type { BabelNodeProgram } from "babel-types";
import * as t from "babel-types";
import { CompilerDiagnostic, FatalError } from "../errors.js";

// ECMA262 15.1.11
export function GlobalDeclarationInstantiation(
  realm: Realm,
  ast: BabelNodeProgram,
  env: LexicalEnvironment,
  strictCode: boolean
) {
  realm.getRunningContext().isStrict = realm.isStrict = strictCode;

  // 1. Let envRec be env's EnvironmentRecord.
  let envRec = env.environmentRecord;

  // 2. Assert: envRec is a global Environment Record.
  invariant(envRec instanceof GlobalEnvironmentRecord, "expected global environment record");

  // 3. Let lexNames be the LexicallyDeclaredNames of script.
  let lexNames = [];

  // 4. Let varNames be the VarDeclaredNames of script.
  let varNames = [];

  traverseFast(ast, node => {
    if (node.type === "VariableDeclaration") {
      if (node.kind === "var") {
        varNames = varNames.concat(Environment.BoundNames(realm, node));
      } else {
        lexNames = lexNames.concat(Environment.BoundNames(realm, node));
      }
    } else if (node.type === "FunctionExpression" || node.type === "FunctionDeclaration") {
      return true;
    }
    return false;
  });

  // 5. For each name in lexNames, do
  for (let name of lexNames) {
    // a. If envRec.HasVarDeclaration(name) is true, throw a SyntaxError exception.
    if (envRec.HasVarDeclaration(name)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, name + " already declared with var");
    }

    // b. If envRec.HasLexicalDeclaration(name) is true, throw a SyntaxError exception.
    if (envRec.HasLexicalDeclaration(name)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.SyntaxError,
        name + " already declared with let or const"
      );
    }

    // c. Let hasRestrictedGlobal be ? envRec.HasRestrictedGlobalProperty(name).
    let hasRestrictedGlobal = envRec.HasRestrictedGlobalProperty(name);

    // d. If hasRestrictedGlobal is true, throw a SyntaxError exception.
    if (hasRestrictedGlobal) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, name + " global object is restricted");
    }
  }

  // 6. For each name in varNames, do
  for (let name of varNames) {
    // a. If envRec.HasLexicalDeclaration(name) is true, throw a SyntaxError exception.
    if (envRec.HasLexicalDeclaration(name)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.SyntaxError,
        name + " already declared with let or const"
      );
    }
  }

  // 7. Let varDeclarations be the VarScopedDeclarations of script.
  let varDeclarations = Functions.FindVarScopedDeclarations(ast);

  // 8. Let functionsToInitialize be a new empty List.
  let functionsToInitialize = [];

  // 9. Let declaredFunctionNames be a new empty List.
  let declaredFunctionNames = [];

  // 10. For each d in varDeclarations, in reverse list order do
  for (let d of varDeclarations.reverse()) {
    // a. If d is neither a VariableDeclaration or a ForBinding, then
    if (d.type !== "VariableDeclaration") {
      // i. Assert: d is either a FunctionDeclaration or a GeneratorDeclaration.
      invariant(d.type === "FunctionDeclaration", "expected function");

      // ii. NOTE If there are multiple FunctionDeclarations for the same name, the last declaration is used.

      // iii. Let fn be the sole element of the BoundNames of d.
      let fn = Environment.BoundNames(realm, d)[0];

      // iv. If fn is not an element of declaredFunctionNames, then
      if (declaredFunctionNames.indexOf(fn) < 0) {
        // 1. Let fnDefinable be ? envRec.CanDeclareGlobalFunction(fn).
        let fnDefinable = envRec.CanDeclareGlobalFunction(fn);

        // 2. If fnDefinable is false, throw a TypeError exception.
        if (!fnDefinable) {
          throw realm.createErrorThrowCompletion(
            realm.intrinsics.TypeError,
            fn + ": global function declarations are not allowed"
          );
        }

        // 3. Append fn to declaredFunctionNames.
        declaredFunctionNames.push(fn);

        // 4. Insert d as the first element of functionsToInitialize.
        functionsToInitialize.unshift(d);
      }
    }
  }

  // 11. Let declaredVarNames be a new empty List.
  let declaredVarNames = [];

  // 12. For each d in varDeclarations, do
  for (let d of varDeclarations) {
    // a. If d is a VariableDeclaration or a ForBinding, then
    if (d.type === "VariableDeclaration") {
      // i. For each String vn in the BoundNames of d, do
      for (let vn of Environment.BoundNames(realm, d)) {
        // ii. If vn is not an element of declaredFunctionNames, then
        if (declaredFunctionNames.indexOf(vn) < 0) {
          // 1. Let vnDefinable be ? envRec.CanDeclareGlobalVar(vn).
          let vnDefinable = envRec.CanDeclareGlobalVar(vn);

          // 2. If vnDefinable is false, throw a TypeError exception.
          if (!vnDefinable) {
            throw realm.createErrorThrowCompletion(
              realm.intrinsics.TypeError,
              vn + ": global variable declarations are not allowed"
            );
          }

          // 3. If vn is not an element of declaredVarNames, then
          if (declaredVarNames.indexOf(vn) < 0) {
            // a. Append vn to declaredVarNames.
            declaredVarNames.push(vn);
          }
        }
      }
    }
  }

  // 13. NOTE: No abnormal terminations occur after this algorithm step if the global object is an ordinary object. However, if the global object is a Proxy exotic object it may exhibit behaviours that cause abnormal terminations in some of the following steps.

  // 14. NOTE: Annex B.3.3.2 adds additional steps at this point.

  // 15. Let lexDeclarations be the LexicallyScopedDeclarations of script.
  let lexDeclarations = [];
  for (let s of ast.body) {
    if (s.type === "VariableDeclaration" && s.kind !== "var") {
      lexDeclarations.push(s);
    }
  }

  // 16. For each element d in lexDeclarations do
  for (let d of lexDeclarations) {
    // a. NOTE Lexically declared names are only instantiated here but not initialized.

    // b. For each element dn of the BoundNames of d do
    for (let dn of Environment.BoundNames(realm, d)) {
      // i. If IsConstantDeclaration of d is true, then
      if (d.kind === "const") {
        // 1. Perform ? envRec.CreateImmutableBinding(dn, true).
        envRec.CreateImmutableBinding(dn, true);
      } else {
        // ii. Else,
        // 1. Perform ? envRec.CreateMutableBinding(dn, false).
        envRec.CreateMutableBinding(dn, false);
      }
    }
  }

  // 17. For each production f in functionsToInitialize, do
  for (let f of functionsToInitialize) {
    // a. Let fn be the sole element of the BoundNames of f.
    let fn = Environment.BoundNames(realm, f)[0];

    // b. Let fo be the result of performing InstantiateFunctionObject for f with argument env.
    let fo = env.evaluate(f, strictCode);
    invariant(fo instanceof Value);

    // c. Perform ? envRec.CreateGlobalFunctionBinding(fn, fo, false).
    envRec.CreateGlobalFunctionBinding(fn, fo, false);
  }

  // 18. For each String vn in declaredVarNames, in list order do
  for (let vn of declaredVarNames) {
    // a. Perform ? envRec.CreateGlobalVarBinding(vn, false).
    envRec.CreateGlobalVarBinding(vn, false);
  }

  // 19. Return NormalCompletion(empty).
  return realm.intrinsics.empty;
}

export default function(ast: BabelNodeProgram, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value {
  strictCode = IsStrict(ast);

  GlobalDeclarationInstantiation(realm, ast, env, strictCode);

  let val;

  for (let node of ast.body) {
    if (node.type !== "FunctionDeclaration") {
      let res = env.evaluateCompletionDeref(node, strictCode);
      if (res instanceof AbruptCompletion) {
        if (!realm.useAbstractInterpretation) throw res;
        // We are about the leave this program and this presents a join point where all non exeptional control flows
        // converge into a single flow using the joined effects as the new state.
        res = Functions.incorporateSavedCompletion(realm, res);
        // The call to incorporateSavedCompletion above, has taken care of the join because res is abrupt.
        // What remains to be done is to emit throw statements to the generator.
        if (res instanceof JoinedAbruptCompletions) {
          emitConditionalThrow(res.joinCondition, res.consequent, res.alternate);
          res = res.value;
        } else if (res instanceof ThrowCompletion) {
          issueThrowCompilerDiagnostic(res.value);
          emitThrow(res.value);
          res = realm.intrinsics.undefined;
        } else {
          invariant(false); // other kinds of abrupt completions should not get this far
        }
      }
      if (!(res instanceof EmptyValue)) {
        val = res;
      }
    }
  }
  let directives = ast.directives;
  if (!val && directives && directives.length) {
    let directive = directives[directives.length - 1];
    val = env.evaluate(directive, strictCode);
    invariant(val instanceof Value);
  }

  // We are about to leave this program and this presents a join point where all control flows
  // converge into a single flow and the joined effects become the final state.
  if (val instanceof Value) {
    val = Functions.incorporateSavedCompletion(realm, val);
    if (val instanceof PossiblyNormalCompletion) {
      // There are still some conditional throws to emit and state still has to be joined in.
      Join.stopEffectCaptureJoinApplyAndReturnCompletion(val, new ReturnCompletion(realm.intrinsics.undefined), realm);
      // The global state has now been updated to the join of all the flows reaching this join point
      emitConditionalThrow(val.joinCondition, val.consequent, val.alternate);
      val = val.value;
    }
  } else {
    // program was empty. Nothing to do.
  }

  invariant(val === undefined || val instanceof Value);
  return val || realm.intrinsics.empty;

  function safeEval(f: () => Value): Value {
    // We use partial evaluation so that we can throw away any state mutations
    let oldErrorHandler = realm.errorHandler;
    realm.errorHandler = d => {
      if (d.severity === "Information" || d.severity === "Warning") return "Recover";
      return "Fail";
    };
    try {
      let effects = realm.evaluateForEffects(() => {
        try {
          return f();
        } catch (e) {
          if (e instanceof Completion) {
            return realm.intrinsics.undefined;
          } else if (e instanceof FatalError) {
            return realm.intrinsics.undefined;
          } else {
            throw e;
          }
        }
      });
      return effects[0] instanceof Value ? effects[0] : realm.intrinsics.undefined;
    } finally {
      realm.errorHandler = oldErrorHandler;
    }
  }

  function issueThrowCompilerDiagnostic(value: Value) {
    let message = "Program may terminate with exception";
    if (value instanceof ObjectValue) {
      let object = ((value: any): ObjectValue);
      let objectMessage = safeEval(() => object.$Get("message", value));
      if (objectMessage instanceof StringValue) message += `: ${objectMessage.value}`;
      const objectStack = safeEval(() => object.$Get("stack", value));
      if (objectStack instanceof StringValue)
        message += `
  ${objectStack.value}`;
    }
    const diagnostic = new CompilerDiagnostic(message, value.expressionLocation, "PP1023", "Warning");
    realm.handleError(diagnostic);
  }

  function emitThrow(value: Value) {
    let generator = realm.generator;
    invariant(generator !== undefined);
    generator.emitStatement([value], ([argument]) => t.throwStatement(argument));
  }

  function emitConditionalThrow(
    condition: AbstractValue,
    trueBranch: Completion | Value,
    falseBranch: Completion | Value
  ) {
    let generator = realm.generator;
    invariant(generator !== undefined);
    let [args, buildfunc] = deconstruct(condition, trueBranch, falseBranch);
    generator.emitStatement(args, buildfunc);
  }

  function deconstruct(condition: AbstractValue, trueBranch: Completion | Value, falseBranch: Completion | Value) {
    let targs;
    let tfunc;
    let fargs;
    let ffunc;
    if (trueBranch instanceof JoinedAbruptCompletions) {
      [targs, tfunc] = deconstruct(trueBranch.joinCondition, trueBranch.consequent, trueBranch.alternate);
    } else if (trueBranch instanceof ThrowCompletion) {
      targs = [trueBranch.value];
      tfunc = ([argument]) => t.throwStatement(argument);
    } else {
      targs = [];
      tfunc = nodes => t.emptyStatement();
    }
    if (falseBranch instanceof JoinedAbruptCompletions) {
      [fargs, ffunc] = deconstruct(falseBranch.joinCondition, falseBranch.consequent, falseBranch.alternate);
    } else if (falseBranch instanceof ThrowCompletion) {
      fargs = [falseBranch.value];
      ffunc = ([argument]) => t.throwStatement(argument);
    } else {
      fargs = [];
      ffunc = nodes => t.emptyStatement();
    }
    let args = [condition].concat(targs).concat(fargs);
    let func = nodes => {
      return t.ifStatement(
        nodes[0],
        tfunc(nodes.splice(1, targs.length)),
        ffunc(nodes.splice(targs.length + 1, fargs.length))
      );
    };
    return [args, func];
  }
}
