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
import { ThrowCompletion } from "../completions.js";
import * as t from "babel-types";
import invariant from "../invariant.js";
import {
  UndefinedValue,
  NullValue,
  NumberValue,
  BooleanValue,
  SymbolValue,
  FunctionValue,
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
  LexicalEnvironment
} from "../environment.js";
import {
  Construct,
  GetV,
  GetThisValue,
  ToObjectPartial,
  PutValue,
  RequireObjectCoercible,
  HasSomeCompatibleType
} from "./index.js";
import type { BabelNode, BabelNodeVariableDeclaration, BabelNodeIdentifier, BabelNodeRestElement, BabelNodeObjectPattern, BabelNodeArrayPattern, BabelNodeStatement } from "babel-types";


// ECMA262 6.2.3
// IsSuperReference(V). Returns true if this reference has a thisValue component.
export function IsSuperReference(realm: Realm, V: Reference): boolean {
  return V.thisValue !== undefined;
}

// ECMA262 6.2.3
// HasPrimitiveBase(V). Returns true if Type(base) is Boolean, String, Symbol, or Number.
export function HasPrimitiveBase(realm: Realm, V: Reference): boolean {
  let base = GetBase(realm, V);
  return base instanceof Value && HasSomeCompatibleType(realm, base, BooleanValue, StringValue, SymbolValue, NumberValue);
}

// ECMA262 6.2.3
// GetReferencedName(V). Returns the referenced name component of the reference V.
export function GetReferencedName(realm: Realm, V: Reference): string | SymbolValue {
  return V.referencedName;
}

// ECMA262 6.2.3.1
export function GetValue(realm: Realm, V: Reference | Value): Value {
  // This step is not necessary as we propagate completions with exceptions.
  // 1. ReturnIfAbrupt(V).

  // 2. If Type(V) is not Reference, return V.
  if (!(V instanceof Reference)) return V;

  // 3. Let base be GetBase(V).
  let base = GetBase(realm, V);

  // 4. If IsUnresolvableReference(V) is true, throw a ReferenceError exception.
  if (IsUnresolvableReference(realm, V)) {
    throw new ThrowCompletion(
      Construct(realm, realm.intrinsics.ReferenceError, [new StringValue(realm, `${V.referencedName.toString()} is not defined`)])
    );
  }

  // 5. If IsPropertyReference(V) is true, then
  if (IsPropertyReference(realm, V)) {
    // a. If HasPrimitiveBase(V) is true, then
    if (HasPrimitiveBase(realm, V)) {
      // i. Assert: In this case, base will never be null or undefined.
      invariant(base instanceof Value && !HasSomeCompatibleType(realm, base, UndefinedValue, NullValue));

      // ii. Let base be ToObject(base).
      base = ToObjectPartial(realm, base);
    }
    invariant(base instanceof ObjectValue || base instanceof AbstractObjectValue);

    // b. Return ? base.[[Get]](GetReferencedName(V), GetThisValue(V)).
    return base.$Get(GetReferencedName(realm, V), GetThisValue(realm, V));
  }

  // 6. Else base must be an Environment Record,
  if (base instanceof EnvironmentRecord) {
    // a. Return ? base.GetBindingValue(GetReferencedName(V), IsStrictReference(V)) (see 8.1.1).
    let referencedName = GetReferencedName(realm, V);
    invariant(typeof referencedName === "string");
    return base.GetBindingValue(referencedName, IsStrictReference(realm, V));
  }

  throw new Error("unknown reference type");
}

// ECMA262 6.2.3
// IsStrictReference(V). Returns the strict reference flag component of the reference V.
export function IsStrictReference(realm: Realm, V: Reference): boolean {
  return V.strict;
}

// ECMA262 6.2.3
// IsPropertyReference(V). Returns true if either the base value is an object or HasPrimitiveBase(V) is true; otherwise returns false.
export function IsPropertyReference(realm: Realm, V: Reference): boolean {
  return V.base instanceof ObjectValue || V.base instanceof AbstractObjectValue ||
    V.base instanceof AbstractObjectValue || HasPrimitiveBase(realm, V);
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
export function ContainsExpression(realm: Realm, node: BabelNode): boolean {
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
export function GetIdentifierReference(realm: Realm, lex: ?LexicalEnvironment, name: string, strict: boolean): Reference {
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
  } else { // 5. Else,
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
export function BlockDeclarationInstantiation(realm: Realm, strictCode: boolean, body: Array<BabelNodeStatement>, env: LexicalEnvironment) {
  // 1. Let envRec be env's EnvironmentRecord.
  let envRec = env.environmentRecord;

  // 2. Assert: envRec is a declarative Environment Record.
  invariant(envRec instanceof DeclarativeEnvironmentRecord, "expected declarative environment record");

  // 3. Let declarations be the LexicallyScopedDeclarations of code.
  let declarations = [];
  for (let node of body) {
    if (node.type === "FunctionDeclaration" || (node.type === "VariableDeclaration" && node.kind !== "var")) {
      declarations.push(node);
    }
  }

  // 4. For each element d in declarations do
  for (let d of declarations) {
    // a. For each element dn of the BoundNames of d do
    for (let dn of BoundNames(realm, d)) {
      if (envRec.HasBinding(dn)) {
        //ECMA262 13.2.1
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.SyntaxError,
             [new StringValue(realm, dn + " already declared")])
        );
      }
      // i. If IsConstantDeclaration of d is true, then
      if (d.type === "VariableDeclaration" && d.kind === "const") {
        // 1. Perform ! envRec.CreateImmutableBinding(dn, true).
        envRec.CreateImmutableBinding(dn, true);
      } else { // ii. Else,
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
export function NewGlobalEnvironment(realm: Realm, G: ObjectValue | AbstractObjectValue, thisValue: ObjectValue | AbstractObjectValue) {
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
export function NewObjectEnvironment(realm: Realm, O: ObjectValue | AbstractObjectValue, E: LexicalEnvironment): LexicalEnvironment {
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
export function NewFunctionEnvironment(realm: Realm, F: FunctionValue, newTarget?: ObjectValue): LexicalEnvironment {
  // 1. Assert: F is an ECMAScript function.
  invariant(F instanceof FunctionValue, "expected a function");

  // 2. Assert: Type(newTarget) is Undefined or Object.
  invariant(newTarget === undefined || newTarget instanceof ObjectValue, "expected undefined or object value for new target");

  // 3. Let env be a new Lexical Environment.
  let env = new LexicalEnvironment(realm);

  // 4. Let envRec be a new function Environment Record containing no bindings.
  let envRec = new FunctionEnvironmentRecord(realm);

  // 5. Set envRec.[[FunctionObject]] to F.
  envRec.$FunctionObject = F;

  // 6. If F's [[ThisMode]] internal slot is lexical, set envRec.[[ThisBindingStatus]] to "lexical".
  if (F.$ThisMode === "lexical") {
    envRec.$ThisBindingStatus = "lexical";
  } else { // 7. Else, set envRec.[[ThisBindingStatus]] to "uninitialized".
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

export function BindingInitialization(realm: Realm, node: BabelNode, value: Value, environment: void | LexicalEnvironment) {
  if (node.type === "ArrayPattern") { // ECMA262 13.3.3.5
    // 1. Let iterator be ? GetIterator(value).
    // 2. Let iteratorRecord be Record {[[Iterator]]: iterator, [[Done]]: false}.
    // 3. Let result be IteratorBindingInitialization for ArrayBindingPattern using iteratorRecord and environment as arguments.
    // 4. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iterator, result).
    // 5. Return result.
    throw new Error("TODO: Patterns aren't supported yet");
  } else if (node.type === "ObjectPattern") { // ECMA262 13.3.3.5
    // 1. Perform ? RequireObjectCoercible(value).
    RequireObjectCoercible(realm, value);

    // 2. Return the result of performing BindingInitialization for ObjectBindingPattern using value and environment as arguments.
    throw new Error("TODO: Patterns aren't supported yet");
  } else if (node.type === "Identifier") { // ECMA262 12.1.5
    // 1. Let name be StringValue of Identifier.
    let name = ((node: any): BabelNodeIdentifier).name;

    // 2. Return ? InitializeBoundName(name, value, environment).
    return InitializeBoundName(realm, name, value, environment);
  } else if (node.type === "VariableDeclaration") { // ECMA262 13.7.5.9
    for (let decl of ((node: any): BabelNodeVariableDeclaration).declarations) {
      BindingInitialization(realm, decl.id, value, environment);
    }
  }

  throw new Error("Unknown node " + node.type);
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
  } else { // 3. Else,
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
    default:
      return false;
  }
}

// ECMA262 13.3.3.7
export function KeyedBindingInitialization(realm: Realm, value: Value, environment: ?LexicalEnvironment, propertyName: string) {
  // 1. Let bindingId be StringValue of BindingIdentifier.
  let bindingId = propertyName;

  // if environment is undefined, the calling context is not strict
  let strict = environment !== undefined;

  // 2. Let lhs be ? ResolveBinding(bindingId, environment).
  let lhs = ResolveBinding(realm, bindingId, strict, environment);

  // 3. Let v be ? GetV(value, propertyName).
  let v = GetV(realm, value, propertyName);

  // 4. If Initializer is present and v is undefined, then
  if (false) {
    // a. Let defaultValue be the result of evaluating Initializer.
    // b. Let v be ? GetValue(defaultValue).
    // c. If IsAnonymousFunctionDefinition(Initializer) is true, then
      // i. Let hasNameProperty be ? HasOwnProperty(v, "name").
      // ii. If hasNameProperty is false, perform SetFunctionName(v, bindingId).
  }

  // 5. If environment is undefined, return ? PutValue(lhs, v).
  if (!environment) return PutValue(realm, lhs, v);

  console.log(lhs, v);

  // 6. Return InitializeReferencedBinding(lhs, v).
  return InitializeReferencedBinding(realm, lhs, v);
}
