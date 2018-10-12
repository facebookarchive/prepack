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
import invariant from "../invariant.js";
import type { PropertyKeyValue } from "../types.js";
import {
  AbstractObjectValue,
  AbstractValue,
  BooleanValue,
  ECMAScriptFunctionValue,
  IntegralValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  Value,
  UndefinedValue,
} from "../values/index.js";
import {
  DeclarativeEnvironmentRecord,
  EnvironmentRecord,
  FunctionEnvironmentRecord,
  GlobalEnvironmentRecord,
  isValidBaseValue,
  LexicalEnvironment,
  ObjectEnvironmentRecord,
  Reference,
  type BaseValue,
} from "../environment.js";
import { AbruptCompletion, SimpleNormalCompletion } from "../completions.js";
import { FatalError } from "../errors.js";
import { EvalPropertyName } from "../evaluators/ObjectExpression.js";
import {
  GetV,
  GetThisValue,
  HasSomeCompatibleType,
  GetIterator,
  IteratorStep,
  IteratorValue,
  IteratorClose,
  IsAnonymousFunctionDefinition,
  HasOwnProperty,
  RequireObjectCoercible,
} from "./index.js";
import { Create, Functions, Properties, To } from "../singletons.js";
import type {
  BabelNode,
  BabelNodeVariableDeclaration,
  BabelNodeIdentifier,
  BabelNodeRestElement,
  BabelNodeObjectProperty,
  BabelNodeObjectPattern,
  BabelNodeArrayPattern,
  BabelNodeStatement,
  BabelNodeLVal,
  BabelNodePattern,
} from "@babel/types";
import * as t from "@babel/types";

export class EnvironmentImplementation {
  // 2.6 RestBindingInitialization (please suggest an appropriate section name)
  RestBindingInitialization(
    realm: Realm,
    property: BabelNodeRestElement,
    value: Value,
    excludedNames: Array<PropertyKeyValue>,
    strictCode: boolean,
    environment: ?LexicalEnvironment
  ): void | boolean | Value {
    let BindingIdentifier = ((property.argument: any): BabelNodeIdentifier);

    // 1. Let restObj be ObjectCreate(%ObjectPrototype%).
    let restObj = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    // 2. Let assignStatus be CopyDataProperties(restObj, value, excludedNames).
    /* let assignStatus = */ Create.CopyDataProperties(realm, restObj, value, excludedNames);

    // 3. ReturnIfAbrupt(assignStatus).

    // 4. Let bindingId be StringValue of BindingIdentifier.
    let bindingId = BindingIdentifier.name;

    // 5. Let lhs be ResolveBinding(bindingId, environment).
    let lhs = this.ResolveBinding(realm, bindingId, strictCode, environment);

    // 6. ReturnIfAbrupt(lhs).

    // 7. If environment is undefined, return PutValue(lhs, restObj).
    if (environment === undefined) {
      return Properties.PutValue(realm, lhs, restObj);
    }

    // 8. Return InitializeReferencedBinding(lhs, restObj).
    return this.InitializeReferencedBinding(realm, lhs, restObj);
  }

  // 2.5  PropertyBindingInitialization (please suggest an appropriate section name)
  PropertyBindingInitialization(
    realm: Realm,
    properties: Array<BabelNodeObjectProperty>,
    value: Value,
    strictCode: boolean,
    environment: ?LexicalEnvironment
  ): Array<PropertyKeyValue> {
    // Base condition for recursive call below
    if (properties.length === 0) {
      return [];
    }

    let BindingProperty = properties.slice(-1)[0];
    let BindingPropertyList = properties.slice(0, -1);

    // 1. Let boundNames be the result of performing PropertyBindingInitialization for BindingPropertyList using value and environment as arguments.
    let boundNames = this.PropertyBindingInitialization(realm, BindingPropertyList, value, strictCode, environment);

    // 2. ReturnIfAbrupt(status boundNames).

    // 3. Let nextNames be the result of performing PropertyBindingInitialization for BindingProperty using value and environment as arguments.
    let nextNames;

    // SingleNameBinding
    // PropertyName : BindingElement
    // 1. Let P be the result of evaluating PropertyName.
    let env = environment ? environment : realm.getRunningContext().lexicalEnvironment;
    let P = EvalPropertyName(BindingProperty, env, realm, strictCode);
    // 2. ReturnIfAbrupt(P).

    // 3. Let status be the result of performing KeyedBindingInitialization of BindingElement with value, environment, and P as the arguments.
    /* let status = */ this.KeyedBindingInitialization(
      realm,
      ((BindingProperty.value: any): BabelNodeIdentifier | BabelNodePattern),
      value,
      strictCode,
      environment,
      P
    );

    // 4. ReturnIfAbrupt(status).

    // 5. Return a new List containing P.
    nextNames = [P];

    // 4. ReturnIfAbrupt(nextNames).

    // 5. Append each item in nextNames to the end of boundNames.
    boundNames = boundNames.concat(nextNames);

    return boundNames;
  }

  // ECMA262 6.2.3
  // IsSuperReference(V). Returns true if this reference has a thisValue component.
  IsSuperReference(realm: Realm, V: Reference): boolean {
    return V.thisValue !== undefined;
  }

  // ECMA262 6.2.3
  // HasPrimitiveBase(V). Returns true if Type(base) is Boolean, String, Symbol, or Number.
  HasPrimitiveBase(realm: Realm, V: Reference): boolean {
    let base = this.GetBase(realm, V);
    // void | ObjectValue | BooleanValue | StringValue | SymbolValue | NumberValue | EnvironmentRecord | AbstractValue;
    if (!base || base instanceof EnvironmentRecord) return false;
    let type = base.getType();
    return (
      type === BooleanValue ||
      type === StringValue ||
      type === SymbolValue ||
      type === NumberValue ||
      type === IntegralValue
    );
  }

  // ECMA262 6.2.3
  // GetReferencedName(V). Returns the referenced name component of the reference V.
  GetReferencedName(realm: Realm, V: Reference): string | SymbolValue {
    if (V.referencedName instanceof AbstractValue) {
      AbstractValue.reportIntrospectionError(V.referencedName);
      throw new FatalError();
    }
    return V.referencedName;
  }

  GetReferencedNamePartial(realm: Realm, V: Reference): AbstractValue | string | SymbolValue {
    return V.referencedName;
  }

  // ECMA262 6.2.3.1
  GetValue(realm: Realm, V: Reference | Value): Value {
    let val = this._dereference(realm, V);
    if (val instanceof AbstractValue) return realm.simplifyAndRefineAbstractValue(val);
    return val;
  }

  GetConditionValue(realm: Realm, V: Reference | Value): Value {
    let val = this._dereference(realm, V);
    if (val instanceof AbstractValue) return realm.simplifyAndRefineAbstractCondition(val);
    return val;
  }

  _dereferenceConditional(
    realm: Realm,
    ref: Reference,
    condValue: AbstractValue,
    consequentVal: Value,
    alternateVal: Value
  ): Value {
    return realm.evaluateWithAbstractConditional(
      condValue,
      () => {
        return realm.evaluateForEffects(
          () => {
            if (isValidBaseValue(consequentVal)) {
              let consequentRef = new Reference(
                ((consequentVal: any): BaseValue),
                ref.referencedName,
                ref.strict,
                ref.thisValue
              );
              return this._dereference(realm, consequentRef);
            }
            return this._dereference(realm, ref, false);
          },
          null,
          "_dereferenceConditional consequent"
        );
      },
      () => {
        return realm.evaluateForEffects(
          () => {
            if (isValidBaseValue(alternateVal)) {
              let alternateRef = new Reference(
                ((alternateVal: any): BaseValue),
                ref.referencedName,
                ref.strict,
                ref.thisValue
              );
              return this._dereference(realm, alternateRef);
            }
            return this._dereference(realm, ref, false);
          },
          null,
          "_dereferenceConditional alternate"
        );
      }
    );
  }

  _dereference(realm: Realm, V: Reference | Value, deferenceConditionals?: boolean = true): Value {
    // This step is not necessary as we propagate completions with exceptions.
    // 1. ReturnIfAbrupt(V).

    // 2. If Type(V) is not Reference, return V.
    if (!(V instanceof Reference)) return V;

    // 3. Let base be GetBase(V).
    let base = this.GetBase(realm, V);

    // 4. If IsUnresolvableReference(V) is true, throw a ReferenceError exception.
    if (this.IsUnresolvableReference(realm, V)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.ReferenceError,
        `${V.referencedName.toString()} is not defined`
      );
    }

    // 5. If IsPropertyReference(V) is true, then
    if (this.IsPropertyReference(realm, V)) {
      if (base instanceof AbstractValue) {
        if (deferenceConditionals && !(base instanceof AbstractObjectValue)) {
          if (base.kind === "conditional") {
            let [condValue, consequentVal, alternateVal] = base.args;
            invariant(condValue instanceof AbstractValue);
            if (isValidBaseValue(consequentVal) || isValidBaseValue(alternateVal)) {
              return this._dereferenceConditional(realm, V, condValue, consequentVal, alternateVal);
            }
          } else if (base.kind === "||") {
            let [leftValue, rightValue] = base.args;
            invariant(leftValue instanceof AbstractValue);
            return this._dereferenceConditional(realm, V, leftValue, leftValue, rightValue);
          } else if (base.kind === "&&") {
            let [leftValue, rightValue] = base.args;
            invariant(leftValue instanceof AbstractValue);
            return this._dereferenceConditional(realm, V, leftValue, rightValue, leftValue);
          }
        }
        // Ensure that abstract values are coerced to objects. This might yield
        // an operation that might throw.
        base = To.ToObject(realm, base);
      }
      // a. If HasPrimitiveBase(V) is true, then
      if (this.HasPrimitiveBase(realm, V)) {
        // i. Assert: In this case, base will never be null or undefined.
        invariant(base instanceof Value && !HasSomeCompatibleType(base, UndefinedValue, NullValue));

        // ii. Let base be To.ToObject(base).
        base = To.ToObject(realm, base);
      }
      invariant(base instanceof ObjectValue || base instanceof AbstractObjectValue);

      // b. Return ? base.[[Get]](GetReferencedName(V), GetThisValue(V)).
      return base.$GetPartial(this.GetReferencedNamePartial(realm, V), GetThisValue(realm, V));
    }

    // 6. Else base must be an Environment Record,
    if (base instanceof EnvironmentRecord) {
      // a. Return ? base.GetBindingValue(GetReferencedName(V), IsStrictReference(V)) (see 8.1.1).
      let referencedName = this.GetReferencedName(realm, V);
      invariant(typeof referencedName === "string");
      return base.GetBindingValue(referencedName, this.IsStrictReference(realm, V));
    }

    invariant(false);
  }

  // ECMA262 6.2.3
  // IsStrictReference(V). Returns the strict reference flag component of the reference V.
  IsStrictReference(realm: Realm, V: Reference): boolean {
    return V.strict;
  }

  // ECMA262 6.2.3
  // IsPropertyReference(V). Returns true if either the base value is an object or HasPrimitiveBase(V) is true; otherwise returns false.
  IsPropertyReference(realm: Realm, V: Reference): boolean {
    // V.base is AbstractValue | void | ObjectValue | BooleanValue | StringValue | SymbolValue | NumberValue | EnvironmentRecord;
    return V.base instanceof AbstractValue || V.base instanceof ObjectValue || this.HasPrimitiveBase(realm, V);
  }

  // ECMA262 6.2.3
  // GetBase(V). Returns the base value component of the reference V.
  GetBase(realm: Realm, V: Reference): void | Value | EnvironmentRecord {
    return V.base;
  }

  // ECMA262 6.2.3
  // IsUnresolvableReference(V). Returns true if the base value is undefined and false otherwise.
  IsUnresolvableReference(realm: Realm, V: Reference): boolean {
    return !V.base;
  }

  // ECMA262 8.1.2.2
  NewDeclarativeEnvironment(realm: Realm, E: LexicalEnvironment, active: boolean = true): LexicalEnvironment {
    // 1. Let env be a new Lexical Environment.
    let env = new LexicalEnvironment(realm);
    if (active) realm.activeLexicalEnvironments.add(env);

    // 2. Let envRec be a new declarative Environment Record containing no bindings.
    let envRec = new DeclarativeEnvironmentRecord(realm);
    envRec.lexicalEnvironment = env;

    // 3. Set env's EnvironmentRecord to envRec.
    env.environmentRecord = envRec;

    // 4. Set the outer lexical environment reference of env to E.
    env.parent = E;

    // 5. Return env.
    return env;
  }

  BoundNames(realm: Realm, node: BabelNode): Array<string> {
    return Object.keys(t.getOuterBindingIdentifiers(node));
  }

  // ECMA262 13.3.3.2
  ContainsExpression(realm: Realm, node: ?BabelNode): boolean {
    if (!node) {
      return false;
    }
    switch (node.type) {
      case "ObjectPattern":
        for (let prop of ((node: any): BabelNodeObjectPattern).properties) {
          if (this.ContainsExpression(realm, prop)) return true;
        }
        return false;
      case "ArrayPattern":
        for (let elem of ((node: any): BabelNodeArrayPattern).elements) {
          if (this.ContainsExpression(realm, elem)) return true;
        }
        return false;
      case "RestElement":
        return this.ContainsExpression(realm, ((node: any): BabelNodeRestElement).argument);
      case "AssignmentPattern":
        return true;
      default:
        return false;
    }
  }

  // ECMA262 8.3.2
  ResolveBinding(realm: Realm, name: string, strict: boolean, env?: ?LexicalEnvironment): Reference {
    // 1. If env was not passed or if env is undefined, then
    if (!env) {
      // a. Let env be the running execution context's LexicalEnvironment.
      env = realm.getRunningContext().lexicalEnvironment;
    }

    // 2. Assert: env is a Lexical Environment.
    invariant(env instanceof LexicalEnvironment, "expected lexical environment");

    // 3. If the code matching the syntactic production that is being evaluated is contained in strict mode code, let strict be true, else let strict be false.

    // 4. Return ? GetIdentifierReference(env, name, strict).
    return this.GetIdentifierReference(realm, env, name, strict);
  }

  // ECMA262 8.1.2.1
  GetIdentifierReference(realm: Realm, lex: ?LexicalEnvironment, name: string, strict: boolean): Reference {
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
      return this.GetIdentifierReference(realm, outer, name, strict);
    }
  }

  // ECMA262 6.2.3.4
  InitializeReferencedBinding(realm: Realm, V: Reference, W: Value): Value {
    // 1. ReturnIfAbrupt(V).
    // 2. ReturnIfAbrupt(W).

    // 3. Assert: Type(V) is Reference.
    invariant(V instanceof Reference, "expected reference");

    // 4. Assert: IsUnresolvableReference(V) is false.
    invariant(!this.IsUnresolvableReference(realm, V), "expected resolvable reference");

    // 5. Let base be GetBase(V).
    let base = this.GetBase(realm, V);

    // 6. Assert: base is an Environment Record.
    invariant(base instanceof EnvironmentRecord, "expected environment record");

    // 7. Return base.InitializeBinding(GetReferencedName(V), W).
    let referencedName = this.GetReferencedName(realm, V);
    invariant(typeof referencedName === "string");
    return base.InitializeBinding(referencedName, W);
  }

  // ECMA262 13.2.14
  BlockDeclarationInstantiation(
    realm: Realm,
    strictCode: boolean,
    body: Array<BabelNodeStatement>,
    env: LexicalEnvironment
  ): void {
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
      for (let dn of this.BoundNames(realm, d)) {
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
        let fn = this.BoundNames(realm, d)[0];

        // ii. Let fo be the result of performing InstantiateFunctionObject for d with argument env.
        let fo = env.evaluate(d, strictCode);
        invariant(fo instanceof Value);

        // iii. Perform envRec.InitializeBinding(fn, fo).
        envRec.InitializeBinding(fn, fo);
      }
    }
  }

  // ECMA262 8.1.2.5
  NewGlobalEnvironment(
    realm: Realm,
    G: ObjectValue | AbstractObjectValue,
    thisValue: ObjectValue | AbstractObjectValue
  ): LexicalEnvironment {
    // 1. Let env be a new Lexical Environment.
    let env = new LexicalEnvironment(realm);

    // 2. Let objRec be a new object Environment Record containing G as the binding object.
    let objRec = new ObjectEnvironmentRecord(realm, G);

    // 3. Let dclRec be a new declarative Environment Record containing no bindings.
    let dclRec = new DeclarativeEnvironmentRecord(realm);
    dclRec.lexicalEnvironment = env;

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
    realm.activeLexicalEnvironments.add(env);

    // 10. Set the outer lexical environment reference of env to null.
    env.parent = null;

    // 11. Return env.
    return env;
  }

  // ECMA262 8.1.2.3
  NewObjectEnvironment(realm: Realm, O: ObjectValue | AbstractObjectValue, E: LexicalEnvironment): LexicalEnvironment {
    // 1. Let env be a new Lexical Environment.
    let env = new LexicalEnvironment(realm);
    realm.activeLexicalEnvironments.add(env);

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
  NewFunctionEnvironment(realm: Realm, F: ECMAScriptFunctionValue, newTarget?: ObjectValue): LexicalEnvironment {
    // 1. Assert: F is an ECMAScript function.
    invariant(F instanceof ECMAScriptFunctionValue, "expected a function");

    // 2. Assert: Type(newTarget) is Undefined or Object.
    invariant(
      newTarget === undefined || newTarget instanceof ObjectValue,
      "expected undefined or object value for new target"
    );

    // 3. Let env be a new Lexical Environment.
    let env = new LexicalEnvironment(realm);
    realm.activeLexicalEnvironments.add(env);

    // 4. Let envRec be a new function Environment Record containing no bindings.
    let envRec = new FunctionEnvironmentRecord(realm);
    envRec.lexicalEnvironment = env;

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
    // Set the inner environment so we can easily traverse environmental scopes
    F.$InnerEnvironment = env;

    // 13. Return env.
    return env;
  }

  // ECMA262 8.3.1
  GetActiveScriptOrModule(realm: Realm): any {
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
  GetThisEnvironment(realm: Realm): EnvironmentRecord {
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
  ResolveThisBinding(realm: Realm): NullValue | ObjectValue | AbstractObjectValue | UndefinedValue {
    // 1. Let envRec be GetThisEnvironment( ).
    let envRec = this.GetThisEnvironment(realm);

    // 2. Return ? envRec.GetThisBinding().
    return envRec.GetThisBinding();
  }

  BindingInitialization(
    realm: Realm,
    node: BabelNodeLVal | BabelNodeVariableDeclaration,
    value: Value,
    strictCode: boolean,
    environment: void | LexicalEnvironment
  ): void | boolean | Value {
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
        result = this.IteratorBindingInitialization(realm, node.elements, iteratorRecord, strictCode, environment);
      } catch (error) {
        // 4. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iterator, result).
        if (iteratorRecord.$Done === false && error instanceof AbruptCompletion) {
          throw IteratorClose(realm, iterator, error);
        }
        throw error;
      }

      // 4. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iterator, result).
      if (iteratorRecord.$Done === false) {
        let completion = IteratorClose(realm, iterator, new SimpleNormalCompletion(realm.intrinsics.undefined));
        if (completion instanceof AbruptCompletion) {
          throw completion;
        }
      }

      // 5. Return result.
      return result;
    } else if (node.type === "ObjectPattern") {
      RequireObjectCoercible(realm, value);

      let BindingPropertyList = [],
        BindingRestElement = null;

      for (let property of node.properties) {
        if (property.type === "RestElement") {
          BindingRestElement = property;
        } else {
          BindingPropertyList.push(property);
        }
      }

      // ObjectBindingPattern:
      //   { BindingPropertyList }
      //   { BindingPropertyList, }

      if (!BindingRestElement) {
        // 1. Let excludedNames be the result of performing PropertyBindingInitialization for BindingPropertyList using value and environment as the argument.
        /* let excludedNames = */ this.PropertyBindingInitialization(
          realm,
          BindingPropertyList,
          value,
          strictCode,
          environment
        );

        // 2. ReturnIfAbrupt(excludedNames).

        // 3. Return NormalCompletion(empty).
        return realm.intrinsics.empty;
      }

      // ObjectBindingPattern : { BindingRestElement }
      if (BindingPropertyList.length === 0) {
        // 1. Let excludedNames be a new empty List.
        let excludedNames = [];

        // 2. Return the result of performing RestBindingInitialization of BindingRestElement with value, environment and excludedNames as the arguments.
        return this.RestBindingInitialization(realm, BindingRestElement, value, excludedNames, strictCode, environment);
      } else {
        // ObjectBindingPattern : { BindingPropertyList, BindingRestElement }

        // 1. Let excludedNames be the result of performing PropertyBindingInitialization of BindingPropertyList using value and environment as arguments.
        let excludedNames = this.PropertyBindingInitialization(
          realm,
          BindingPropertyList,
          value,
          strictCode,
          environment
        );

        // 2. ReturnIfAbrupt(excludedNames).

        // 3. Return the result of performing RestBindingInitialization of BindingRestElement with value, environment and excludedNames as the arguments.
        return this.RestBindingInitialization(realm, BindingRestElement, value, excludedNames, strictCode, environment);
      }
    } else if (node.type === "Identifier") {
      // ECMA262 12.1.5
      // 1. Let name be StringValue of Identifier.
      let name = ((node: any): BabelNodeIdentifier).name;

      // 2. Return ? InitializeBoundName(name, value, environment).
      return this.InitializeBoundName(realm, name, value, environment);
    } else {
      invariant(node.type === "VariableDeclaration");
      // ECMA262 13.7.5.9
      for (let decl of ((node: any): BabelNodeVariableDeclaration).declarations) {
        this.BindingInitialization(realm, decl.id, value, strictCode, environment);
      }
    }
  }

  // ECMA262 13.3.3.6
  // ECMA262 14.1.19
  IteratorBindingInitialization(
    realm: Realm,
    formals: $ReadOnlyArray<BabelNodeLVal | null>,
    iteratorRecord: { $Iterator: ObjectValue, $Done: boolean },
    strictCode: boolean,
    environment: void | LexicalEnvironment
  ): void {
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
        let lhs = this.ResolveBinding(realm, param.name, strictCode, environment);

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
          v = this.GetValue(realm, defaultValue);

          // c. If IsAnonymousFunctionDefinition(Initializer) is true, then
          if (IsAnonymousFunctionDefinition(realm, Initializer) && v instanceof ObjectValue) {
            // i. Let hasNameProperty be ? HasOwnProperty(v, "name").
            let hasNameProperty = HasOwnProperty(realm, v, "name");

            // ii. If hasNameProperty is false, perform SetFunctionName(v, bindingId).
            if (hasNameProperty === false) {
              Functions.SetFunctionName(realm, v, bindingId);
            }
          }
        }

        // 6. If environment is undefined, return ? PutValue(lhs, v).
        if (!environment) {
          Properties.PutValue(realm, lhs, v);
          continue;
        }

        // 7. Return InitializeReferencedBinding(lhs, v).
        this.InitializeReferencedBinding(realm, lhs, v);
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
          v = this.GetValue(realm, defaultValue);
        }

        // 4. Return the result of performing BindingInitialization of BindingPattern with v and environment as the arguments.
        this.BindingInitialization(realm, param, v, strictCode, environment);
        continue;
      }
    }

    // Handle the rest element if we have one.
    if (restEl && restEl.argument.type === "Identifier") {
      // BindingRestElement : ...BindingIdentifier

      // 1. Let lhs be ? ResolveBinding(StringValue of BindingIdentifier, environment).
      let lhs = this.ResolveBinding(realm, restEl.argument.name, strictCode, environment);

      // 2. Let A be ArrayCreate(0).
      let A = Create.ArrayCreate(realm, 0);

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
            Properties.PutValue(realm, lhs, A);
            break;
          }

          // ii. Return InitializeReferencedBinding(lhs, A).
          this.InitializeReferencedBinding(realm, lhs, A);
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

        // f. Let status be CreateDataProperty(A, ! To.ToString(n), nextValue).
        let status = Create.CreateDataProperty(realm, A, n.toString(), nextValue);

        // g. Assert: status is true.
        invariant(status, "expected to create data property");

        // h. Increment n by 1.
        n += 1;
      }
    } else if (restEl) {
      invariant(restEl.argument.type === "ArrayPattern" || restEl.argument.type === "ObjectPattern");
      // 1. Let A be ArrayCreate(0).
      let A = Create.ArrayCreate(realm, 0);

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
          this.BindingInitialization(realm, restEl.argument, A, strictCode, environment);
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

        // f. Let status be CreateDataProperty(A, ! To.ToString(n), nextValue).
        let status = Create.CreateDataProperty(realm, A, n.toString(), nextValue);

        // g. Assert: status is true.
        invariant(status, "expected to create data property");

        // h. Increment n by 1.
        n += 1;
      }
    }
  }

  // ECMA262 12.1.5.1
  InitializeBoundName(
    realm: Realm,
    name: string,
    value: Value,
    environment: void | LexicalEnvironment
  ): void | boolean | Value {
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
      let lhs = this.ResolveBinding(realm, name, false);

      // b. Return ? PutValue(lhs, value).
      return Properties.PutValue(realm, lhs, value);
    }
  }

  // ECMA262 12.3.1.3 and 13.7.5.6
  IsDestructuring(ast: BabelNode): boolean {
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
  KeyedBindingInitialization(
    realm: Realm,
    node: BabelNodeIdentifier | BabelNodePattern,
    value: Value,
    strictCode: boolean,
    environment: ?LexicalEnvironment,
    propertyName: PropertyKeyValue
  ): void | boolean | Value {
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
      let lhs = this.ResolveBinding(realm, bindingId, strictCode, environment);

      // 3. Let v be ? GetV(value, propertyName).
      let v = GetV(realm, value, propertyName);

      // 4. If Initializer is present and v is undefined, then
      if (Initializer && v instanceof UndefinedValue) {
        // a. Let defaultValue be the result of evaluating Initializer.
        let defaultValue = env.evaluate(Initializer, strictCode);

        // b. Let v be ? GetValue(defaultValue).
        v = this.GetValue(realm, defaultValue);

        // c. If IsAnonymousFunctionDefinition(Initializer) is true, then
        if (IsAnonymousFunctionDefinition(realm, Initializer) && v instanceof ObjectValue) {
          // i. Let hasNameProperty be ? HasOwnProperty(v, "name").
          let hasNameProperty = HasOwnProperty(realm, v, "name");
          // ii. If hasNameProperty is false, perform SetFunctionName(v, bindingId).
          if (hasNameProperty === false) {
            Functions.SetFunctionName(realm, v, bindingId);
          }
        }
      }

      // 5. If environment is undefined, return ? PutValue(lhs, v).
      if (!environment) return Properties.PutValue(realm, lhs, v);

      // 6. Return InitializeReferencedBinding(lhs, v).
      return this.InitializeReferencedBinding(realm, lhs, v);
    } else if (node.type === "ObjectPattern" || node.type === "ArrayPattern") {
      // BindingElement : BindingPattern Initializer

      // 1. Let v be ? GetV(value, propertyName).
      let v = GetV(realm, value, propertyName);

      // 2. If Initializer is present and v is undefined, then
      if (Initializer && v instanceof UndefinedValue) {
        // a. Let defaultValue be the result of evaluating Initializer.
        let defaultValue = env.evaluate(Initializer, strictCode);

        // b. Let v be ? GetValue(defaultValue).
        v = this.GetValue(realm, defaultValue);
      }

      // 3. Return the result of performing BindingInitialization for BindingPattern passing v and environment as arguments.
      return this.BindingInitialization(realm, node, v, strictCode, env);
    }
  }
}
