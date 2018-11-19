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
import type { LexicalEnvironment } from "../environment.js";
import { AbstractValue, Value, type ECMAScriptSourceFunctionValue } from "../values/index.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { NullValue, EmptyValue, ObjectValue, ECMAScriptFunctionValue } from "../values/index.js";
import type {
  BabelNodeClassDeclaration,
  BabelNodeClassExpression,
  BabelNodeClassMethod,
  BabelNodeExpression,
} from "@babel/types";
import parse from "../utils/parse.js";
import {
  HasOwnProperty,
  IsConstructor,
  Get,
  MakeConstructor,
  MakeClassConstructor,
  ConstructorMethod,
  IsStatic,
  NonConstructorMethodDefinitions,
} from "../methods/index.js";
import { Create, Environment, Functions, Properties } from "../singletons.js";
import invariant from "../invariant.js";

function EvaluateClassHeritage(
  realm: Realm,
  ClassHeritage: BabelNodeExpression,
  strictCode: boolean
): ObjectValue | null {
  let ref = realm.getRunningContext().lexicalEnvironment.evaluate(ClassHeritage, strictCode);
  let val = Environment.GetValue(realm, ref);
  if (val instanceof AbstractValue) {
    let error = new CompilerDiagnostic("unknown super class", ClassHeritage.loc, "PP0009", "RecoverableError");
    if (realm.handleError(error) === "Fail") throw new FatalError();
  }
  if (!(val instanceof ObjectValue)) {
    return null;
  }
  return val;
}

// ECMA262 14.5.14
export function ClassDefinitionEvaluation(
  realm: Realm,
  ast: BabelNodeClassDeclaration | BabelNodeClassExpression,
  className: string | void,
  strictCode: boolean,
  env: LexicalEnvironment
): ECMAScriptSourceFunctionValue {
  // 1. Let lex be the LexicalEnvironment of the running execution context.
  let lex = env;

  // 2. Let classScope be NewDeclarativeEnvironment(lex).
  let classScope = Environment.NewDeclarativeEnvironment(realm, lex);
  let F;

  try {
    // 3. Let classScopeEnvRec be classScope’s EnvironmentRecord.
    let classScopeEnvRec = classScope.environmentRecord;

    // 4. If className is not undefined, then
    if (className !== undefined) {
      // a. Perform classScopeEnvRec.CreateImmutableBinding(className, true).
      classScopeEnvRec.CreateImmutableBinding(className, true);
    }

    let protoParent;
    let constructorParent;
    // 5. If ClassHeritage opt is not present, then
    let ClassHeritage = ast.superClass;
    if (!ClassHeritage) {
      // a. Let protoParent be the intrinsic object %ObjectPrototype%.
      protoParent = realm.intrinsics.ObjectPrototype;

      // b. Let constructorParent be the intrinsic object %FunctionPrototype%.
      constructorParent = realm.intrinsics.FunctionPrototype;
    } else {
      // 6. Else
      // a. Set the running execution context’s LexicalEnvironment to classScope.
      realm.getRunningContext().lexicalEnvironment = classScope;
      let superclass = null;
      try {
        // b. Let superclass be the result of evaluating ClassHeritage.
        superclass = EvaluateClassHeritage(realm, ClassHeritage, strictCode);
      } finally {
        // c. Set the running execution context’s LexicalEnvironment to lex.
        realm.getRunningContext().lexicalEnvironment = lex;
      }

      // d. ReturnIfAbrupt(superclass).

      // e. If superclass is null, then
      if (superclass === null) {
        // i. Let protoParent be null.
        protoParent = realm.intrinsics.null;

        // ii. Let constructorParent be the intrinsic object %FunctionPrototype%.
        constructorParent = realm.intrinsics.FunctionPrototype;
      } else if (!IsConstructor(realm, superclass)) {
        // f. Else if IsConstructor(superclass) is false, throw a TypeError exception.
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "superclass must be a constructor");
      } else {
        // g. Else
        // i. If superclass has a [[FunctionKind]] internal slot whose value is "generator", throw a TypeError exception.
        if (superclass instanceof ECMAScriptFunctionValue && superclass.$FunctionKind === "generator") {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "superclass cannot be a generator");
        }

        // ii. Let protoParent be Get(superclass, "prototype").
        protoParent = Get(realm, superclass, "prototype");

        // iii. ReturnIfAbrupt(protoParent).

        // iv. If Type(protoParent) is neither Object nor Null, throw a TypeError exception.
        if (!(protoParent instanceof ObjectValue || protoParent instanceof NullValue)) {
          if (protoParent instanceof AbstractValue) {
            let error = new CompilerDiagnostic(
              "unknown super class prototype",
              ClassHeritage.loc,
              "PP0010",
              "RecoverableError"
            );
            if (realm.handleError(error) === "Fail") throw new FatalError();
            protoParent = realm.intrinsics.ObjectPrototype;
          } else {
            throw realm.createErrorThrowCompletion(
              realm.intrinsics.TypeError,
              "protoParent must be an instance of Object or Null"
            );
          }
        }

        // v. Let constructorParent be superclass.
        constructorParent = superclass;
      }
    }

    // 7. Let proto be ObjectCreate(protoParent).
    let proto = Create.ObjectCreate(realm, protoParent);

    // Provide a hint that this prototype is that of a class
    proto.$IsClassPrototype = true;

    let constructor;
    let emptyConstructor = false;
    let ClassBody: Array<BabelNodeClassMethod> = [];
    for (let elem of ast.body.body) {
      if (elem.type === "ClassMethod") {
        ClassBody.push(elem);
      }
    }
    // 8. If ClassBody opt is not present, let constructor be empty.
    if (ClassBody.length === 0) {
      emptyConstructor = true;
      constructor = realm.intrinsics.empty;
    } else {
      // 9. Else, let constructor be ConstructorMethod of ClassBody.
      constructor = ConstructorMethod(realm, ClassBody);
    }

    // 10. If constructor is empty, then,
    if (constructor instanceof EmptyValue) {
      emptyConstructor = true;
      let constructorFile;
      // a. If ClassHeritage opt is present, then
      if (ast.superClass) {
        // i. Let constructor be the result of parsing the source text
        //     constructor(... args){ super (...args);}
        // using the syntactic grammar with the goal symbol MethodDefinition.
        constructorFile = parse(realm, "class NeedClassForParsing { constructor(... args){ super (...args);} }", "");
      } else {
        // b. Else,
        // i. Let constructor be the result of parsing the source text
        //     constructor( ){ }
        // using the syntactic grammar with the goal symbol MethodDefinition.
        constructorFile = parse(realm, "class NeedClassForParsing { constructor( ){ } }", "");
      }

      let {
        program: {
          body: [classDeclaration],
        },
      } = constructorFile;
      invariant(classDeclaration.type === "ClassDeclaration");
      let { body } = ((classDeclaration: any): BabelNodeClassDeclaration);
      invariant(body.body[0].type === "ClassMethod");
      constructor = ((body.body[0]: any): BabelNodeClassMethod);
    }

    // 11. Set the running execution context’s LexicalEnvironment to classScope.
    realm.getRunningContext().lexicalEnvironment = classScope;

    try {
      // 12. Let constructorInfo be the result of performing DefineMethod for constructor with arguments proto and constructorParent as the optional functionPrototype argument.
      let constructorInfo = Functions.DefineMethod(realm, constructor, proto, env, strictCode, constructorParent);

      // 13. Assert: constructorInfo is not an abrupt completion.

      // 14. Let F be constructorInfo.[[closure]]
      F = constructorInfo.$Closure;

      // Assign the empty constructor boolean
      F.$HasEmptyConstructor = emptyConstructor;

      // 15. If ClassHeritage opt is present, set F’s [[ConstructorKind]] internal slot to "derived".
      if (ast.superClass) {
        F.$ConstructorKind = "derived";
      }

      // 16. Perform MakeConstructor(F, false, proto).
      MakeConstructor(realm, F, false, proto);

      // 17. Perform MakeClassConstructor(F).
      MakeClassConstructor(realm, F);

      // 18. Perform CreateMethodProperty(proto, "constructor", F).
      Create.CreateMethodProperty(realm, proto, "constructor", F);

      let methods;
      // 19. If ClassBody opt is not present, let methods be a new empty List.
      if (ClassBody.length === 0) {
        methods = [];
      } else {
        // 20. Else, let methods be NonConstructorMethodDefinitions of ClassBody.
        methods = NonConstructorMethodDefinitions(realm, ClassBody);
      }

      // 21. For each ClassElement m in order from methods
      for (let m of methods) {
        // a. If IsStatic of m is false, then
        if (!IsStatic(m)) {
          // Let status be the result of performing PropertyDefinitionEvaluation for m with arguments proto and false.
          Properties.PropertyDefinitionEvaluation(realm, m, proto, (env: any), strictCode, false);
        } else {
          // Else,
          // Let status be the result of performing PropertyDefinitionEvaluation for m with arguments F and false.
          Properties.PropertyDefinitionEvaluation(realm, m, F, (env: any), strictCode, false);
        }
        // c. If status is an abrupt completion, then
        // i. Set the running execution context's LexicalEnvironment to lex.
        // ii. Return Completion(status).
      }
    } finally {
      // 22. Set the running execution context’s LexicalEnvironment to lex.
      realm.getRunningContext().lexicalEnvironment = lex;
    }

    // 23. If className is not undefined, then
    if (className !== undefined) {
      // Perform classScopeEnvRec.InitializeBinding(className, F).
      classScopeEnvRec.InitializeBinding(className, F);
    }
  } finally {
    realm.onDestroyScope(classScope);
  }
  // Return F.
  return F;
}

// ECMA2 14.5.15
function BindingClassDeclarationEvaluation(
  realm: Realm,
  ast: BabelNodeClassDeclaration,
  strictCode: boolean,
  env: LexicalEnvironment
) {
  // ClassDeclaration : class BindingIdentifier ClassTail
  if (ast.id) {
    // 1. Let className be StringValue of BindingIdentifier.
    let className = ast.id.name;

    // 2. Let value be the result of ClassDefinitionEvaluation of ClassTail with argument className.
    let value = ClassDefinitionEvaluation(realm, ast, className, strictCode, env);

    // 3. ReturnIfAbrupt(value).

    // 4. Let hasNameProperty be HasOwnProperty(value, "name").
    let hasNameProperty = HasOwnProperty(realm, value, "name");

    // 5. ReturnIfAbrupt(hasNameProperty).

    // 6. If hasNameProperty is false, then perform SetFunctionName(value, className).
    if (hasNameProperty === false) {
      Functions.SetFunctionName(realm, value, className);
    }

    // 7. Let env be the running execution context’s LexicalEnvironment.

    // 8. Let status be InitializeBoundName(className, value, env).
    Environment.InitializeBoundName(realm, className, value, env);

    // 9. ReturnIfAbrupt(status).

    // 10. Return value.
    return value;
  } else {
    // ClassDeclaration : class ClassTail
    // 1. Return the result of ClassDefinitionEvaluation of ClassTail with argument undefined.
    return ClassDefinitionEvaluation(realm, ast, undefined, strictCode, env);
  }
}

// ECMA262 14.5.16
export default function(
  ast: BabelNodeClassDeclaration,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  // 1. Let status be the result of BindingClassDeclarationEvaluation of this ClassDeclaration.
  BindingClassDeclarationEvaluation(realm, ast, strictCode, env);

  // 2. ReturnIfAbrupt(status).

  // 3. Return NormalCompletion(empty).
  return realm.intrinsics.empty;
}
