/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import * as t from "babel-types";
import invariant from "../invariant.js";
import type { PropertyKeyValue } from "../types.js";
import {
  AbstractValue,
  UndefinedValue,
  NullValue,
  NumberValue,
  BooleanValue,
  SymbolValue,
  ECMAScriptFunctionValue,
  ObjectValue,
  StringValue,
  Value,
  AbstractObjectValue,
} from "../values/index.js";
import {
  ObjectEnvironmentRecord,
  FunctionEnvironmentRecord,
  EnvironmentRecord,
  DeclarativeEnvironmentRecord,
  GlobalEnvironmentRecord,
  Reference,
  LexicalEnvironment,
} from "../environment.js";
import { NormalCompletion, AbruptCompletion } from "../completions.js";
import { FatalError } from "../errors.js";
import { EvalPropertyName } from "../evaluators/ObjectExpression.js";
import {
  GetV,
  GetThisValue,
  ToObjectPartial,
  PutValue,
  RequireObjectCoercible,
  HasSomeCompatibleType,
  GetIterator,
  IteratorStep,
  IteratorValue,
  IteratorClose,
  CreateDataProperty,
  ArrayCreate,
  IsAnonymousFunctionDefinition,
  HasOwnProperty,
  SetFunctionName,
} from "./index.js";
import type {
  BabelNode,
  BabelNodeVariableDeclaration,
  BabelNodeIdentifier,
  BabelNodeRestElement,
  BabelNodeObjectPattern,
  BabelNodeArrayPattern,
  BabelNodeStatement,
  BabelNodeLVal,
  BabelNodePattern,
} from "babel-types";

// ECMA262 6.2.3
// IsSuperReference(V). Returns true if this reference has a thisValue component.
export function IsSuperReference(realm: Realm, V: Reference): boolean {
  return V.thisValue !== undefined;
}

// ECMA262 6.2.3
// HasPrimitiveBase(V). Returns true if Type(base) is Boolean, String, Symbol, or Number.
export function HasPrimitiveBase(realm: Realm, V: Reference): boolean {
  let base = GetBase(realm, V);
  // void | ObjectValue | BooleanValue | StringValue | SymbolValue | NumberValue | EnvironmentRecord | AbstractValue;
  if (!base || base instanceof EnvironmentRecord) return false;
  let type = base.getType();
  return type === BooleanValue || type === StringValue || type === SymbolValue || type === NumberValue;
}

// ECMA262 6.2.3
// GetReferencedName(V). Returns the referenced name component of the reference V.
export function GetReferencedName(realm: Realm, V: Reference): string | SymbolValue {
  if (V.referencedName instanceof AbstractValue) {
    AbstractValue.reportIntrospectionError(V.referencedName);
    throw new FatalError();
  }
  return V.referencedName;
}

export function GetReferencedNamePartial(realm: Realm, V: Reference): AbstractValue | string | SymbolValue {
  return V.referencedName;
}

// ECMA262 6.2.3.1
export function GetValue(realm: Realm, V: Reference | Value): Value {
  let val = dereference(realm, V);
  if (val instanceof AbstractValue) return realm.simplifyAndRefineAbstractValue(val);
  return val;
}

function dereference(realm: Realm, V: Reference | Value): Value {
  // This step is not necessary as we propagate completions with exceptions.
  // 1. ReturnIfAbrupt(V).

  // 2. If Type(V) is not Reference, return V.
  if (!(V instanceof Reference)) return V;

  // 3. Let base be GetBase(V).
  let base = GetBase(realm, V);

  // 4. If IsUnresolvableReference(V) is true, throw a ReferenceError exception.
  if (IsUnresolvableReference(realm, V)) {
    throw realm.createErrorThrowCompletion(
      realm.intrinsics.ReferenceError,
      `${V.referencedName.toString()} is not defined`
    );
  }

  // 5. If IsPropertyReference(V) is true, then
  if (IsPropertyReference(realm, V)) {
    // a. If HasPrimitiveBase(V) is true, then
    if (HasPrimitiveBase(realm, V)) {
      // i. Assert: In this case, base will never be null or undefined.
      invariant(base instanceof Value && !HasSomeCompatibleType(base, UndefinedValue, NullValue));

      // ii. Let base be ToObject(base).
      base = ToObjectPartial(realm, base);
    }
    invariant(base instanceof ObjectValue || base instanceof AbstractObjectValue);

    // b. Return ? base.[[Get]](GetReferencedName(V), GetThisValue(V)).
    return base.$GetPartial(GetReferencedNamePartial(realm, V), GetThisValue(realm, V));
  }

  // 6. Else base must be an Environment Record,
  if (base instanceof EnvironmentRecord) {
    // a. Return ? base.GetBindingValue(GetReferencedName(V), IsStrictReference(V)) (see 8.1.1).
    let referencedName = GetReferencedName(realm, V);
    invariant(typeof referencedName === "string");
    return base.GetBindingValue(referencedName, IsStrictReference(realm, V));
  }

  invariant(false);
}

// ECMA262 6.2.3
// IsStrictReference(V). Returns the strict reference flag component of the reference V.
export function IsStrictReference(realm: Realm, V: Reference): boolean {
  return V.strict;
}

// ECMA262 6.2.3
// IsPropertyReference(V). Returns true if either the base value is an object or HasPrimitiveBase(V) is true; otherwise returns false.
export function IsPropertyReference(realm: Realm, V: Reference): boolean {
  // V.base is AbstractValue | void | ObjectValue | BooleanValue | StringValue | SymbolValue | NumberValue | EnvironmentRecord;
  return V.base instanceof AbstractValue || V.base instanceof ObjectValue || HasPrimitiveBase(realm, V);
}

// ECMA262 6.2.3
// GetBase(V). Returns the base value component of the reference V.
export function GetBase(realm: Realm, V: Reference): void | Value | EnvironmentRecord {
  return V.base;
}

// ECMA262 6.2.3
// IsUnresolvableReference(V). Returns true if the base value is undefined and false otherwise.
export function IsUnresolvableReference(realm: Realm, V: Reference): boolean {
  return !V.base;
}

// ECMA262 8.1.2.2
export function NewDeclarativeEnvironment(realm: Realm, E: LexicalEnvironment): LexicalEnvironment {
  // 1. Let env be a new Lexical Environment.
  let env = new LexicalEnvironment(realm);

  // 2. Let envRec be a new declarative Environment Record containing no bindings.
  let envRec = new DeclarativeEnvironmentRecord(realm);

  // 3. Set env's EnvironmentRecord to envRec.
  env.environmentRecord = envRec;

  // 4. Set the outer lexical environment reference of env to E.
  env.parent = E;

  // 5. Return env.
  return env;
}

export function BoundNames(realm: Realm, node: BabelNode): Array<string> {
  return Object.keys(t.getOuterBindingIdentifiers(node));
}

// ECMA262 13.3.3.2
export function ContainsExpression(realm: Realm, node: ?BabelNode): boolean {
  if (!node) {
    return false;
  }
  switch (node.type) {
    case "ObjectPattern":
      for (let prop of ((node: any): BabelNodeObjectPattern).properties) {
        if (ContainsExpression(realm, prop)) return true;
      }
      return false;
    case "ArrayPattern":
      for (let elem of ((node: any): BabelNodeArrayPattern).elements) {
        if (ContainsExpression(realm, elem)) return true;
      }
      return false;
    case "RestElement":
      return ContainsExpression(realm, ((node: any): BabelNodeRestElement).argument);
    case "AssignmentPattern":
      return true;
    default:
      return false;
  }
}

// ECMA262 8.3.2
export function ResolveBinding(realm: Realm, name: string, strict: boolean, env?: ?LexicalEnvironment): Reference {
  // 1. If env was not passed or if env is undefined, then
  if (!env) {
    // a. Let env be the running execution context's LexicalEnvironment.
    env = realm.getRunningContext().lexicalEnvironment;
  }

  // 2. Assert: env is a Lexical Environment.
  invariant(env instanceof LexicalEnvironment, "expected lexical environment");

  // 3. If the code matching the syntactic production that is being evaluated is contained in strict mode code, let strict be true, else let strict be false.

  // 4. Return ? GetIdentifierReference(env, name, strict).
  return GetIdentifierReference(realm, env, name, strict);
}

// ECMA262 8.1.2.1
export function GetIdentifierReference(
  realm: Realm,
  lex: ?LexicalEnvironment,
  name: string,
  strict: boolean
): Reference {
  // 1. If lex is the value null, then
  if (!lex) {
    // a. Return a value of type Reference whose base value is undefined, whose referenced name is name, and whose strict reference flag is strict.
    return new Reference(undefined, name, strict);
  }

  // 2. Let envRec be lex's EnvironmentRecord.
  let envRec = lex.environmentRecord;

  // 3. Let exists be ? envRec.HasBinding(name).
  let exists = envRec.HasBinding(name);

  // 4. If exists is true, then
  if (exists) {
    // a. Return a value of type Reference whose base value is envRec, whose referenced name is name, and whose strict reference flag is strict.
    return new Reference(envRec, name, strict);
  } else {
    // 5. Else,
    // a. Let outer be the value of lex's outer environment reference.
    let outer = lex.parent;

    // b. Return ? GetIdentifierReference(outer, name, strict).
    return GetIdentifierReference(realm, outer, name, strict);
  }
}

// ECMA262 6.2.3.4
export function InitializeReferencedBinding(realm: Realm, V: Reference, W: Value): Value {
  // 1. ReturnIfAbrupt(V).
  // 2. ReturnIfAbrupt(W).

  // 3. Assert: Type(V) is Reference.
  invariant(V instanceof Reference, "expected reference");

  // 4. Assert: IsUnresolvableReference(V) is false.
  invariant(!IsUnresolvableReference(realm, V), "expected resolvable reference");

  // 5. Let base be GetBase(V).
  let base = GetBase(realm, V);

  // 6. Assert: base is an Environment Record.
  invariant(base instanceof EnvironmentRecord, "expected environment record");

  // 7. Return base.InitializeBinding(GetReferencedName(V), W).
  let referencedName = GetReferencedName(realm, V);
  invariant(typeof referencedName === "string");
  return base.InitializeBinding(referencedName, W);
}

// ECMA262 13.2.14
export function BlockDeclarationInstantiation(
  realm: Realm,
  strictCode: boolean,
  body: Array<BabelNodeStatement>,
  env: LexicalEnvironment
) {
  // 1. Let envRec be env's EnvironmentRecord.
  let envRec = env.environmentRecord;

  // 2. Assert: envRec is a declarative Environment Record.
  invariant(envRec instanceof DeclarativeEnvironmentRecord, "expected declarative environment record");

  // 3. Let declarations be the LexicallyScopedDeclarations of code.
  let declarations = [];
  for (let node of body) {
    if (
      node.type === "ClassDeclaration" ||
      node.type === "FunctionDeclaration" ||
      (node.type === "VariableDeclaration" && node.kind !== "var")
    ) {
      declarations.push(node);
    }
  }

  // 4. For each element d in declarations do
  for (let d of declarations) {
    // a. For each element dn of the BoundNames of d do
    for (let dn of BoundNames(realm, d)) {
      if (envRec.HasBinding(dn)) {
        //ECMA262 13.2.1
        throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, dn + " already declared");
      }
      // i. If IsConstantDeclaration of d is true, then
      if (d.type === "VariableDeclaration" && d.kind === "const") {
        // 1. Perform ! envRec.CreateImmutableBinding(dn, true).
        envRec.CreateImmutableBinding(dn, true);
      } else {
        // ii. Else,
        // 1. Perform ! envRec.CreateMutableBinding(dn, false).
        envRec.CreateMutableBinding(dn, false);
      }
    }

    // b. If d is a GeneratorDeclaration production or a FunctionDeclaration production, then
    if (d.type === "FunctionDeclaration") {
      // i. Let fn be the sole element of the BoundNames of d.
      let fn = BoundNames(realm, d)[0];

      // ii. Let fo be the result of performing InstantiateFunctionObject for d with argument env.
      let fo = env.evaluate(d, strictCode);
      invariant(fo instanceof Value);

      // iii. Perform envRec.InitializeBinding(fn, fo).
      envRec.InitializeBinding(fn, fo);
    }
  }
}

// ECMA262 8.1.2.5
export function NewGlobalEnvironment(
  realm: Realm,
  G: ObjectValue | AbstractObjectValue,
  thisValue: ObjectValue | AbstractObjectValue
) {
  // 1. Let env be a new Lexical Environment.
  let env = new LexicalEnvironment(realm);

  // 2. Let objRec be a new object Environment Record containing G as the binding object.
  let objRec = new ObjectEnvironmentRecord(realm, G);

  // 3. Let dclRec be a new declarative Environment Record containing no bindings.
  let dclRec = new DeclarativeEnvironmentRecord(realm);

  // 4. Let globalRec be a new global Environment Record.
  let globalRec = new GlobalEnvironmentRecord(realm);

  // 5. Set globalRec.[[ObjectRecord]] to objRec.
  globalRec.$ObjectRecord = objRec;

  // 6. Set globalRec.[[GlobalThisValue]] to thisValue.
  globalRec.$GlobalThisValue = thisValue;

  // 7. Set globalRec.[[DeclarativeRecord]] to dclRec.
  globalRec.$DeclarativeRecord = dclRec;

  // 8. Set globalRec.[[VarNames]] to a new empty List.
  globalRec.$VarNames = [];

  // 9. Set env's EnvironmentRecord to globalRec.
  env.environmentRecord = globalRec;

  // 10. Set the outer lexical environment reference of env to null.
  env.parent = null;

  // 11. Return env.
  return env;
}

// ECMA262 8.1.2.3
export function NewObjectEnvironment(
  realm: Realm,
  O: ObjectValue | AbstractObjectValue,
  E: LexicalEnvironment
): LexicalEnvironment {
  // 1. Let env be a new Lexical Environment.
  let env = new LexicalEnvironment(realm);

  // 2. Let envRec be a new object Environment Record containing O as the binding object.
  let envRec = new ObjectEnvironmentRecord(realm, O);

  // 3. Set env's EnvironmentRecord to envRec.
  env.environmentRecord = envRec;

  // 4. Set the outer lexical environment reference of env to E.
  env.parent = E;

  // 5. Return env.
  return env;
}

// ECMA262 8.1.2.4
export function NewFunctionEnvironment(
  realm: Realm,
  F: ECMAScriptFunctionValue,
  newTarget?: ObjectValue
): LexicalEnvironment {
  // 1. Assert: F is an ECMAScript function.
  invariant(F instanceof ECMAScriptFunctionValue, "expected a function");

  // 2. Assert: Type(newTarget) is Undefined or Object.
  invariant(
    newTarget === undefined || newTarget instanceof ObjectValue,
    "expected undefined or object value for new target"
  );

  // 3. Let env be a new Lexical Environment.
  let env = new LexicalEnvironment(realm);

  // 4. Let envRec be a new function Environment Record containing no bindings.
  let envRec = new FunctionEnvironmentRecord(realm);

  // 5. Set envRec.[[FunctionObject]] to F.
  envRec.$FunctionObject = F;

  // 6. If F's [[ThisMode]] internal slot is lexical, set envRec.[[ThisBindingStatus]] to "lexical".
  if (F.$ThisMode === "lexical") {
    envRec.$ThisBindingStatus = "lexical";
  } else {
    // 7. Else, set envRec.[[ThisBindingStatus]] to "uninitialized".
    envRec.$ThisBindingStatus = "uninitialized";
  }

  // 8. Let home be the value of F's [[HomeObject]] internal slot.
  let home = F.$HomeObject;

  // 9. Set envRec.[[HomeObject]] to home.
  envRec.$HomeObject = home;

  // 10. Set envRec.[[NewTarget]] to newTarget.
  envRec.$NewTarget = newTarget;

  // 11. Set env's EnvironmentRecord to envRec.
  env.environmentRecord = envRec;

  // 12. Set the outer lexical environment reference of env to the value of F's [[Environment]] internal slot.
  env.parent = F.$Environment;

  // 13. Return env.
  return env;
}

// ECMA262 8.3.1
export function GetActiveScriptOrModule(realm: Realm) {
  // The GetActiveScriptOrModule abstract operation is used to determine the running script or module, based on the active function object.
  // GetActiveScriptOrModule performs the following steps:
  //
  // If the execution context stack is empty, return null.
  if (realm.contextStack.length === 0) return null;
  // Let ec be the topmost execution context on the execution context stack whose Function component's [[ScriptOrModule]] component is not null.
  // If such an execution context exists, return ec's Function component's [[ScriptOrModule]] slot's value.
  let ec;
  for (let i = realm.contextStack.length - 1; i >= 0; i--) {
    ec = realm.contextStack[i];
    let F = ec.function;
    if (F == null) continue;
    if (F.$ScriptOrModule instanceof Object) {
      return F.$ScriptOrModule;
    }
  }
  // Otherwise, let ec be the running execution context.
  ec = realm.getRunningContext();
  // Assert: ec's ScriptOrModule component is not null.
  invariant(ec.ScriptOrModule !== null);
  // Return ec's ScriptOrModule component.
  return ec.ScriptOrModule;
}

// ECMA262 8.3.3
export function GetThisEnvironment(realm: Realm): EnvironmentRecord {
  // 1. Let lex be the running execution context's LexicalEnvironment.
  let lex = realm.getRunningContext().lexicalEnvironment;

  // 2. Repeat
  while (true) {
    // a. Let envRec be lex's EnvironmentRecord.
    let envRec = lex.environmentRecord;

    // b. Let exists be envRec.HasThisBinding().
    let exists = envRec.HasThisBinding();

    // c. If exists is true, return envRec.
    if (exists) return envRec;

    // d. Let outer be the value of lex's outer environment reference.
    let outer = lex.parent;
    invariant(outer);

    // e. Let lex be outer.
    lex = outer;
  }

  invariant(false);
}

// ECMA262 8.3.4
export function ResolveThisBinding(realm: Realm): NullValue | ObjectValue | AbstractObjectValue | UndefinedValue {
  // 1. Let envRec be GetThisEnvironment( ).
  let envRec = GetThisEnvironment(realm);

  // 2. Return ? envRec.GetThisBinding().
  return envRec.GetThisBinding();
}

export function BindingInitialization(
  realm: Realm,
  node: BabelNodeLVal | BabelNodeVariableDeclaration,
  value: Value,
  strictCode: boolean,
  environment: void | LexicalEnvironment
) {
  if (node.type === "ArrayPattern") {
    // ECMA262 13.3.3.5
    // 1. Let iterator be ? GetIterator(value).
    let iterator = GetIterator(realm, value);

    // 2. Let iteratorRecord be Record {[[Iterator]]: iterator, [[Done]]: false}.
    let iteratorRecord = {
      $Iterator: iterator,
      $Done: false,
    };

    let result;

    // 3. Let result be IteratorBindingInitialization for ArrayBindingPattern using iteratorRecord and environment as arguments.
    try {
      result = IteratorBindingInitialization(realm, node.elements, iteratorRecord, strictCode, environment);
    } catch (error) {
      // 4. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iterator, result).
      if (iteratorRecord.$Done === false && error instanceof AbruptCompletion) {
        throw IteratorClose(realm, iterator, error);
      }
      throw error;
    }

    // 4. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iterator, result).
    if (iteratorRecord.$Done === false) {
      let completion = IteratorClose(realm, iterator, new NormalCompletion(realm.intrinsics.undefined));
      if (completion instanceof AbruptCompletion) {
        throw completion;
      }
    }

    // 5. Return result.
    return result;
  } else if (node.type === "ObjectPattern") {
    // ECMA262 13.3.3.5
    // BindingPattern : ObjectBindingPattern

    // 1. Perform ? RequireObjectCoercible(value).
    RequireObjectCoercible(realm, value);

    // 2. Return the result of performing BindingInitialization for ObjectBindingPattern using value and environment as arguments.
    for (let property of node.properties) {
      let env = environment ? environment : realm.getRunningContext().lexicalEnvironment;

      // 1. Let P be the result of evaluating PropertyName.
      let P = EvalPropertyName(property, env, realm, strictCode);

      // 2. ReturnIfAbrupt(P).

      // 3. Return the result of performing KeyedBindingInitialization for BindingElement using value, environment, and P as arguments.
      KeyedBindingInitialization(realm, property.value, value, strictCode, environment, P);
    }
  } else if (node.type === "Identifier") {
    // ECMA262 12.1.5
    // 1. Let name be StringValue of Identifier.
    let name = ((node: any): BabelNodeIdentifier).name;

    // 2. Return ? InitializeBoundName(name, value, environment).
    return InitializeBoundName(realm, name, value, environment);
  } else {
    invariant(node.type === "VariableDeclaration");
    // ECMA262 13.7.5.9
    for (let decl of ((node: any): BabelNodeVariableDeclaration).declarations) {
      BindingInitialization(realm, decl.id, value, strictCode, environment);
    }
  }
}

// ECMA262 13.3.3.6
// ECMA262 14.1.19
export function IteratorBindingInitialization(
  realm: Realm,
  formals: $ReadOnlyArray<BabelNodeLVal | null>,
  iteratorRecord: { $Iterator: ObjectValue, $Done: boolean },
  strictCode: boolean,
  environment: void | LexicalEnvironment
) {
  let env = environment ? environment : realm.getRunningContext().lexicalEnvironment;

  // Check if the last formal is a rest element. If so then we want to save the
  // element and handle it separately after we iterate through the other
  // formals. This also enforces that a rest element may only ever be in the
  // last position.
  let restEl;
  if (formals.length > 0) {
    let lastFormal = formals[formals.length - 1];
    if (lastFormal !== null && lastFormal.type === "RestElement") {
      restEl = lastFormal;
      formals = formals.slice(0, -1);
    }
  }

  for (let param of formals) {
    if (param === null) {
      // Elision handling in IteratorDestructuringAssignmentEvaluation

      // 1. If iteratorRecord.[[Done]] is false, then
      if (iteratorRecord.$Done === false) {
        // a. Let next be IteratorStep(iteratorRecord.[[Iterator]]).
        let next;
        try {
          next = IteratorStep(realm, iteratorRecord.$Iterator);
        } catch (e) {
          // b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
          if (e instanceof AbruptCompletion) {
            iteratorRecord.$Done = true;
          }
          // c. ReturnIfAbrupt(next).
          throw e;
        }
        // d. If next is false, set iteratorRecord.[[Done]] to true.
        if (next === false) {
          iteratorRecord.$Done = true;
        }
      }
      // 2. Return NormalCompletion(empty).
      continue;
    }

    let Initializer;
    if (param.type === "AssignmentPattern") {
      Initializer = param.right;
      param = param.left;
    }

    if (param.type === "Identifier") {
      // SingleNameBinding : BindingIdentifier Initializer

      // 1. Let bindingId be StringValue of BindingIdentifier.
      let bindingId = param.name;

      // 2. Let lhs be ? ResolveBinding(bindingId, environment).
      let lhs = ResolveBinding(realm, param.name, strictCode, environment);

      // Initialized later in the algorithm.
      let v;

      // 3. If iteratorRecord.[[Done]] is false, then
      if (iteratorRecord.$Done === false) {
        // a. Let next be IteratorStep(iteratorRecord.[[Iterator]]).
        let next: ObjectValue | false;
        try {
          next = IteratorStep(realm, iteratorRecord.$Iterator);
        } catch (e) {
          // b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
          if (e instanceof AbruptCompletion) {
            iteratorRecord.$Done = true;
          }
          // c. ReturnIfAbrupt(next).
          throw e;
        }

        // d. If next is false, set iteratorRecord.[[Done]] to true.
        if (next === false) {
          iteratorRecord.$Done = true;
          // Normally this assignment would be done in step 4, but we do it
          // here so that Flow knows `v` will always be initialized by step 5.
          v = realm.intrinsics.undefined;
        } else {
          // e. Else,
          // i. Let v be IteratorValue(next).
          try {
            v = IteratorValue(realm, next);
          } catch (e) {
            // ii. If v is an abrupt completion, set iteratorRecord.[[Done]] to true.
            if (e instanceof AbruptCompletion) {
              iteratorRecord.$Done = true;
            }
            // iii. ReturnIfAbrupt(v).
            throw e;
          }
        }
      } else {
        // 4. If iteratorRecord.[[Done]] is true, let v be undefined.
        v = realm.intrinsics.undefined;
      }

      // 5. If Initializer is present and v is undefined, then
      if (Initializer && v instanceof UndefinedValue) {
        // a. Let defaultValue be the result of evaluating Initializer.
        let defaultValue = env.evaluate(Initializer, strictCode);

        // b. Let v be ? GetValue(defaultValue).
        v = GetValue(realm, defaultValue);

        // c. If IsAnonymousFunctionDefinition(Initializer) is true, then
        if (IsAnonymousFunctionDefinition(realm, Initializer) && v instanceof ObjectValue) {
          // i. Let hasNameProperty be ? HasOwnProperty(v, "name").
          let hasNameProperty = HasOwnProperty(realm, v, "name");

          // ii. If hasNameProperty is false, perform SetFunctionName(v, bindingId).
          if (hasNameProperty === false) {
            SetFunctionName(realm, v, bindingId);
          }
        }
      }

      // 6. If environment is undefined, return ? PutValue(lhs, v).
      if (!environment) {
        PutValue(realm, lhs, v);
        continue;
      }

      // 7. Return InitializeReferencedBinding(lhs, v).
      InitializeReferencedBinding(realm, lhs, v);
      continue;
    } else {
      invariant(param.type === "ObjectPattern" || param.type === "ArrayPattern");
      // BindingElement : BindingPatternInitializer

      // Initialized later in the algorithm.
      let v;

      // 1. If iteratorRecord.[[Done]] is false, then
      if (iteratorRecord.$Done === false) {
        // a. Let next be IteratorStep(iteratorRecord.[[Iterator]]).
        let next;
        try {
          next = IteratorStep(realm, iteratorRecord.$Iterator);
        } catch (e) {
          // b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
          if (e instanceof AbruptCompletion) {
            iteratorRecord.$Done = true;
          }
          // c. ReturnIfAbrupt(next).
          throw e;
        }

        // d. If next is false, set iteratorRecord.[[Done]] to true.
        if (next === false) {
          iteratorRecord.$Done = true;
          // Normally this assignment would be done in step 2, but we do it
          // here so that Flow knows `v` will always be initialized by step 3.
          v = realm.intrinsics.undefined;
        } else {
          // e. Else,
          // i. Let v be IteratorValue(next).
          try {
            v = IteratorValue(realm, next);
          } catch (e) {
            // ii. If v is an abrupt completion, set iteratorRecord.[[Done]] to true.
            if (e instanceof AbruptCompletion) {
              iteratorRecord.$Done = true;
            }
            // iii. ReturnIfAbrupt(v).
            throw e;
          }
        }
      } else {
        // 2. If iteratorRecord.[[Done]] is true, let v be undefined.
        v = realm.intrinsics.undefined;
      }

      // 3. If Initializer is present and v is undefined, then
      if (Initializer && v instanceof UndefinedValue) {
        // a. Let defaultValue be the result of evaluating Initializer.
        let defaultValue = env.evaluate(Initializer, strictCode);

        // b. Let v be ? GetValue(defaultValue).
        v = GetValue(realm, defaultValue);
      }

      // 4. Return the result of performing BindingInitialization of BindingPattern with v and environment as the arguments.
      BindingInitialization(realm, param, v, strictCode, environment);
      continue;
    }
  }

  // Handle the rest element if we have one.
  if (restEl && restEl.argument.type === "Identifier") {
    // BindingRestElement : ...BindingIdentifier

    // 1. Let lhs be ? ResolveBinding(StringValue of BindingIdentifier, environment).
    let lhs = ResolveBinding(realm, restEl.argument.name, strictCode, environment);

    // 2. Let A be ArrayCreate(0).
    let A = ArrayCreate(realm, 0);

    // 3. Let n be 0.
    let n = 0;

    // 4. Repeat,
    while (true) {
      // Initialized later in the algorithm.
      let next: ObjectValue | false;

      // a. If iteratorRecord.[[Done]] is false, then
      if (iteratorRecord.$Done === false) {
        // i. Let next be IteratorStep(iteratorRecord.[[Iterator]]).
        try {
          next = IteratorStep(realm, iteratorRecord.$Iterator);
        } catch (e) {
          // ii. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
          if (e instanceof AbruptCompletion) {
            iteratorRecord.$Done = true;
          }
          // iii. ReturnIfAbrupt(next).
          throw e;
        }
        // iv. If next is false, set iteratorRecord.[[Done]] to true.
        if (next === false) {
          iteratorRecord.$Done = true;
        }
      }

      // b. If iteratorRecord.[[Done]] is true, then
      if (iteratorRecord.$Done === true) {
        // i. If environment is undefined, return ? PutValue(lhs, A).
        if (!environment) {
          PutValue(realm, lhs, A);
          break;
        }

        // ii. Return InitializeReferencedBinding(lhs, A).
        InitializeReferencedBinding(realm, lhs, A);
        break;
      }

      // Given the nature of the algorithm this should always be true, however
      // it is difficult to arrange the code in such a way where Flow's control
      // flow analysis will pick that up, so we add an invariant here.
      invariant(next instanceof ObjectValue);

      // c. Let nextValue be IteratorValue(next).
      let nextValue;
      try {
        nextValue = IteratorValue(realm, next);
      } catch (e) {
        // d. If nextValue is an abrupt completion, set iteratorRecord.[[Done]] to true.
        if (e instanceof AbruptCompletion) {
          iteratorRecord.$Done = true;
        }
        // e. ReturnIfAbrupt(nextValue).
        throw e;
      }

      // f. Let status be CreateDataProperty(A, ! ToString(n), nextValue).
      let status = CreateDataProperty(realm, A, n.toString(), nextValue);

      // g. Assert: status is true.
      invariant(status, "expected to create data property");

      // h. Increment n by 1.
      n += 1;
    }
  } else if (restEl) {
    invariant(restEl.argument.type === "ArrayPattern" || restEl.argument.type === "ObjectPattern");
    // 1. Let A be ArrayCreate(0).
    let A = ArrayCreate(realm, 0);

    // 2. Let n be 0.
    let n = 0;

    // 3. Repeat,
    while (true) {
      // Initialized later in the algorithm.
      let next;

      // a. If iteratorRecord.[[Done]] is false, then
      if (iteratorRecord.$Done === false) {
        // i. Let next be IteratorStep(iteratorRecord.[[Iterator]]).
        try {
          next = IteratorStep(realm, iteratorRecord.$Iterator);
        } catch (e) {
          // ii. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
          if (e instanceof AbruptCompletion) {
            iteratorRecord.$Done = true;
          }
          // iii. ReturnIfAbrupt(next).
          throw e;
        }
        // iv. If next is false, set iteratorRecord.[[Done]] to true.
        if (next === false) {
          iteratorRecord.$Done = true;
        }
      }

      // b. If iteratorRecord.[[Done]] is true, then
      if (iteratorRecord.$Done === true) {
        // i. Return the result of performing BindingInitialization of BindingPattern with A and environment as the arguments.
        BindingInitialization(realm, restEl.argument, A, strictCode, environment);
        break;
      }

      // Given the nature of the algorithm this should always be true, however
      // it is difficult to arrange the code in such a way where Flow's control
      // flow analysis will pick that up, so we add an invariant here.
      invariant(next instanceof ObjectValue);

      // c. Let nextValue be IteratorValue(next).
      let nextValue;
      try {
        nextValue = IteratorValue(realm, next);
      } catch (e) {
        // d. If nextValue is an abrupt completion, set iteratorRecord.[[Done]] to true.
        if (e instanceof AbruptCompletion) {
          iteratorRecord.$Done = true;
        }
        // e. ReturnIfAbrupt(nextValue).
        throw e;
      }

      // f. Let status be CreateDataProperty(A, ! ToString(n), nextValue).
      let status = CreateDataProperty(realm, A, n.toString(), nextValue);

      // g. Assert: status is true.
      invariant(status, "expected to create data property");

      // h. Increment n by 1.
      n += 1;
    }
  }
}

// ECMA262 12.1.5.1
export function InitializeBoundName(realm: Realm, name: string, value: Value, environment: void | LexicalEnvironment) {
  // 1. Assert: Type(name) is String.
  invariant(typeof name === "string", "expected name to be a string");

  // 2. If environment is not undefined, then
  if (environment) {
    // a. Let env be the EnvironmentRecord component of environment.
    let env = environment.environmentRecord;

    // b. Perform env.InitializeBinding(name, value).
    env.InitializeBinding(name, value);

    // c. Return NormalCompletion(undefined).
    return realm.intrinsics.undefined;
  } else {
    // 3. Else,
    // a. Let lhs be ResolveBinding(name).
    // Note that the undefined environment implies non-strict.
    let lhs = ResolveBinding(realm, name, false);

    // b. Return ? PutValue(lhs, value).
    return PutValue(realm, lhs, value);
  }
}

// ECMA262 12.3.1.3 and 13.7.5.6
export function IsDestructuring(ast: BabelNode) {
  switch (ast.type) {
    case "VariableDeclaration":
      for (let decl of ((ast: any): BabelNodeVariableDeclaration).declarations) {
        switch (decl.type) {
          case "VariableDeclarator":
            switch (decl.id.type) {
              case "ArrayPattern":
              case "AssignmentPattern":
              case "ObjectPattern":
                return true;
              default:
                break;
            }
            break;
          default:
            break;
        }
      }
      return false;
    case "ArrayLiteral":
    case "ObjectLiteral":
      return true;
    case "ArrayPattern":
    case "ObjectPattern":
      return true;
    default:
      return false;
  }
}

// ECMA262 13.3.3.7
export function KeyedBindingInitialization(
  realm: Realm,
  node: BabelNodeIdentifier | BabelNodePattern,
  value: Value,
  strictCode: boolean,
  environment: ?LexicalEnvironment,
  propertyName: PropertyKeyValue
) {
  let env = environment ? environment : realm.getRunningContext().lexicalEnvironment;

  let Initializer;
  if (node.type === "AssignmentPattern") {
    Initializer = node.right;
    node = node.left;
  }

  if (node.type === "Identifier") {
    // SingleNameBinding : BindingIdentifier Initializer

    // 1. Let bindingId be StringValue of BindingIdentifier.
    let bindingId = node.name;

    // 2. Let lhs be ? ResolveBinding(bindingId, environment).
    let lhs = ResolveBinding(realm, bindingId, strictCode, environment);

    // 3. Let v be ? GetV(value, propertyName).
    let v = GetV(realm, value, propertyName);

    // 4. If Initializer is present and v is undefined, then
    if (Initializer && v instanceof UndefinedValue) {
      // a. Let defaultValue be the result of evaluating Initializer.
      let defaultValue = env.evaluate(Initializer, strictCode);

      // b. Let v be ? GetValue(defaultValue).
      v = GetValue(realm, defaultValue);

      // c. If IsAnonymousFunctionDefinition(Initializer) is true, then
      if (IsAnonymousFunctionDefinition(realm, Initializer) && v instanceof ObjectValue) {
        // i. Let hasNameProperty be ? HasOwnProperty(v, "name").
        let hasNameProperty = HasOwnProperty(realm, v, "name");

        // ii. If hasNameProperty is false, perform SetFunctionName(v, bindingId).
        if (hasNameProperty === false) {
          SetFunctionName(realm, v, bindingId);
        }
      }
    }

    // 5. If environment is undefined, return ? PutValue(lhs, v).
    if (!environment) return PutValue(realm, lhs, v);

    // 6. Return InitializeReferencedBinding(lhs, v).
    return InitializeReferencedBinding(realm, lhs, v);
  } else if (node.type === "ObjectPattern" || node.type === "ArrayPattern") {
    // BindingElement : BindingPattern Initializer

    // 1. Let v be ? GetV(value, propertyName).
    let v = GetV(realm, value, propertyName);

    // 2. If Initializer is present and v is undefined, then
    if (Initializer && v instanceof UndefinedValue) {
      // a. Let defaultValue be the result of evaluating Initializer.
      let defaultValue = env.evaluate(Initializer, strictCode);

      // b. Let v be ? GetValue(defaultValue).
      v = GetValue(realm, defaultValue);
    }

    // 3. Return the result of performing BindingInitialization for BindingPattern passing v and environment as arguments.
    return BindingInitialization(realm, node, v, strictCode, env);
  }
}
