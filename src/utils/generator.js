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
import { AbstractValue, Value, FunctionValue, UndefinedValue, NullValue, StringValue, BooleanValue, NumberValue, SymbolValue, ObjectValue, ConcreteValue } from "../values/index.js";
import type { AbstractValueBuildNodeFunction } from "../values/AbstractValue.js";
import type { Descriptor } from "../types.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import * as base62 from "base62";
import * as t from "babel-types";
import invariant from "../invariant.js";
import type { BabelNodeExpression, BabelNodeIdentifier, BabelNodeStatement, BabelNodeMemberExpression, BabelNodeThisExpression } from "babel-types";

export type SerializationContext = {
  reasons: Array<string>;
  serializeValue: Value => BabelNodeExpression;
  startBody: () => Array<BabelNodeStatement>;
  endBody: Array<BabelNodeStatement> => void;
  announceDeclaredDerivedId: BabelNodeIdentifier => void;
}

export type GeneratorBuildNodeFunction = (Array<BabelNodeExpression>, SerializationContext) => BabelNodeStatement;

export type BodyEntry = {
  declaresDerivedId?: BabelNodeIdentifier;
  args: Array<Value>;
  buildNode: GeneratorBuildNodeFunction;
  dependencies?: Array<Generator>;
}

export class Generator {
  constructor(realm: Realm) {
    invariant(realm.useAbstractInterpretation);
    let realmPreludeGenerator = realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;
    this.realm = realm;
    this.body = [];
  }

  realm: Realm;
  body: Array<BodyEntry>;
  preludeGenerator: PreludeGenerator;

  clone(): Generator {
    let result = new Generator(this.realm);
    result.body = this.body.slice(0);
    return result;
  }

  getAsPropertyNameExpression(key: string, canBeIdentifier: boolean = true) {
    // If key is a non-negative numeric string literal, parse it and set it as a numeric index instead.
    let index = Number.parseInt(key, 10);
    if (index >= 0 && index.toString() === key) {
      return t.numericLiteral(index);
    }

    if (canBeIdentifier) {
      // TODO: revert this when Unicode identifiers are supported by all targetted JavaScript engines
      let keyIsAscii = /^[\u0000-\u007f]*$/.test(key);
      if (t.isValidIdentifier(key) && keyIsAscii) return t.identifier(key);
    }

    return t.stringLiteral(key);
  }

  empty() {
    return !this.body.length;
  }

  emitGlobalDeclaration(key: string, value: Value) {
    this.preludeGenerator.declaredGlobals.add(key);
    this.emitGlobalAssignment(key, value);
  }

  emitGlobalAssignment(key: string, value: Value) {
    this.body.push({
      args: [value],
      buildNode: ([valueNode]) => t.expressionStatement(t.assignmentExpression(
        "=",
        this.preludeGenerator.globalReference(key, true),
        valueNode))
    });
  }

  emitGlobalDelete(key: string) {
    this.body.push({
      args: [],
      buildNode: ([]) => t.expressionStatement(t.unaryExpression(
        "delete",
        this.preludeGenerator.globalReference(key, true)))
    });
  }

  emitPropertyAssignment(object: Value, key: string, value: Value) {
    let propName = this.getAsPropertyNameExpression(key);
    this.body.push({
      args: [object, value],
      buildNode: ([objectNode, valueNode]) => t.expressionStatement(t.assignmentExpression(
        "=",
        t.memberExpression(objectNode, propName, !t.isIdentifier(propName)),
        valueNode))
    });
  }

  emitDefineProperty(object: Value, key: string, desc: Descriptor) {
    if (desc.enumerable && desc.configurable && desc.writable && desc.value) {
      let descValue = desc.value;
      invariant(descValue instanceof Value);
      this.emitPropertyAssignment(object, key, descValue);
    } else {
      desc = Object.assign({}, desc);
      this.body.push({
        args: [object, desc.value || object.$Realm.intrinsics.undefined, desc.get || object.$Realm.intrinsics.undefined, desc.set || object.$Realm.intrinsics.undefined],
        buildNode: ([objectNode, valueNode, getNode, setNode]) => {
          let descProps = [];
          descProps.push(t.objectProperty(t.identifier("enumerable"), t.booleanLiteral(!!desc.enumerable)));
          descProps.push(t.objectProperty(t.identifier("configurable"), t.booleanLiteral(!!desc.configurable)));
          if (!desc.get && !desc.set) {
            descProps.push(t.objectProperty(t.identifier("writable"), t.booleanLiteral(!!desc.writable)));
            descProps.push(t.objectProperty(t.identifier("value"), valueNode));
          } else {
            descProps.push(t.objectProperty(t.identifier("get"), getNode));
            descProps.push(t.objectProperty(t.identifier("set"), setNode));
          }
          return t.expressionStatement(t.callExpression(
            this.preludeGenerator.memoizeReference("Object.defineProperty"),
            [objectNode, t.stringLiteral(key), t.objectExpression(descProps)]
          ));
        }
      });
    }
  }

  emitPropertyDelete(object: Value, key: string) {
    let propName = this.getAsPropertyNameExpression(key);
    this.body.push({
      args: [object],
      buildNode: ([objectNode]) => t.expressionStatement(t.unaryExpression(
        "delete",
        t.memberExpression(objectNode, propName, !t.isIdentifier(propName))))
    });
  }

  emitCall(createCallee: () => BabelNodeExpression, args: Array<Value>) {
    this.body.push({
      args,
      buildNode: values => t.expressionStatement(
        t.callExpression(createCallee(), [...values]))
    });
  }

  emitConsoleLog(method: "log" | "warn" | "error", args: Array<string | ConcreteValue>) {
    this.emitCall(
      () => t.memberExpression(t.identifier("console"), t.identifier(method)),
      args.map(v => typeof v === "string" ? new StringValue(this.realm, v) : v));
  }

  // Pushes "if (violationConditionFn()) { throw new Error("invariant violation"); }"
  emitInvariant(args: Array<Value>, violationConditionFn: (Array<BabelNodeExpression> => BabelNodeExpression), appendLastToInvariantFn?: (BabelNodeExpression => BabelNodeExpression)): void {
    this.body.push({
      args,
      buildNode: (nodes: Array<BabelNodeExpression>) => {
        let throwString = t.stringLiteral("Prepack model invariant violation");
        if (appendLastToInvariantFn) {
          let last = nodes.pop();
          throwString = t.binaryExpression("+",
            t.stringLiteral("Prepack model invariant violation: "),
            appendLastToInvariantFn(last));
        }
        let condition = violationConditionFn(nodes);
        let throwblock = t.blockStatement([
          t.throwStatement(
            t.newExpression(
              t.identifier("Error"),
              [throwString]))
          ]);
        return t.ifStatement(condition, throwblock);
      } });
  }

  emitCallAndCaptureResult(types: TypesDomain, values: ValuesDomain, createCallee: () => BabelNodeExpression, args: Array<Value>, kind?: string): AbstractValue {
    return this.derive(types, values, args,
      nodes => t.callExpression(createCallee(), nodes));
  }

  emitVoidExpression(types: TypesDomain, values: ValuesDomain, args: Array<Value>, buildNode_: AbstractValueBuildNodeFunction | BabelNodeExpression): UndefinedValue {
    this.body.push({
      args,
      buildNode: (nodes: Array<BabelNodeExpression>) => t.expressionStatement(
        (buildNode_: any) instanceof Function ?
        ((buildNode_: any): AbstractValueBuildNodeFunction)(nodes) :
        ((buildNode_: any): BabelNodeExpression)
      )
    });
    return this.realm.intrinsics.undefined;
  }

  derive(types: TypesDomain, values: ValuesDomain, args: Array<Value>, buildNode_: AbstractValueBuildNodeFunction | BabelNodeExpression, kind?: string): AbstractValue {
    invariant(buildNode_ instanceof Function || args.length === 0);
    let id = t.identifier(this.preludeGenerator.nameGenerator.generate("derived"));
    this.preludeGenerator.derivedIds.set(id.name, args);
    this.body.push({
      declaresDerivedId: id,
      args,
      buildNode: (nodes: Array<BabelNodeExpression>) => t.variableDeclaration("var", [
        t.variableDeclarator(id, (buildNode_: any) instanceof Function ? ((buildNode_: any): AbstractValueBuildNodeFunction)(nodes) : ((buildNode_: any): BabelNodeExpression))
      ])
    });
    let res = this.realm.createAbstract(types, values, args, id, kind);
    let type = types.getType();
    res.intrinsicName = id.name;
    let typeofString;
    if (type === FunctionValue) typeofString = "function";
    else if (type === UndefinedValue) invariant(false);
    else if (type === NullValue) invariant(false);
    else if (type === StringValue) typeofString = "string";
    else if (type === BooleanValue) typeofString = "boolean";
    else if (type === NumberValue) typeofString = "number";
    else if (type === SymbolValue) typeofString = "symbol";
    else if (type === ObjectValue) typeofString = "object";
    if (typeofString !== undefined) {
      // Verify that the types are as expected, a failure of this invariant
      // should mean the model is wrong.
      this.emitInvariant(
        [res, res],
        (nodes) => {
          invariant(typeofString !== undefined);
          let condition =
            t.binaryExpression("!==",
              t.unaryExpression("typeof", nodes[0]), t.stringLiteral(typeofString));
          if (typeofString === "object") {
            condition =
              t.logicalExpression("&&", condition,
                t.binaryExpression("!==",
                  t.unaryExpression("typeof", nodes[0]), t.stringLiteral("function")));
            condition =
              t.logicalExpression("||", condition,
                t.binaryExpression("===", nodes[0], t.nullLiteral()));
          }
          return condition;
        },
        (node) => node);
    }

    return res;
  }

  serialize(body: Array<BabelNodeStatement>, context: SerializationContext) {
    for (let bodyEntry of this.body) {
      let nodes = bodyEntry.args.map((boundArg, i) => context.serializeValue(boundArg));
      body.push(bodyEntry.buildNode(nodes, context));
      let id = bodyEntry.declaresDerivedId;
      if (id !== undefined) context.announceDeclaredDerivedId(id);
    }
  }

  visit(visitValue: Value => void, visitGenerator: Generator => void) {
    for (let bodyEntry of this.body) {
      for (let boundArg of bodyEntry.args)
        visitValue(boundArg);
      if (bodyEntry.dependencies)
        for (let dependency of bodyEntry.dependencies)
          visitGenerator(dependency);
    }
  }
}

export class NameGenerator {
  constructor(forbiddenNames: Set<string>, debugNames: boolean, uniqueSuffix: string, prefix: string) {
    this.prefix = prefix;
    this.uidCounter = 0;
    this.debugNames = debugNames;
    this.forbiddenNames = forbiddenNames;
    this.uniqueSuffix = uniqueSuffix;
  }
  prefix: string;
  uidCounter: number;
  debugNames: boolean;
  forbiddenNames: Set<string>;
  uniqueSuffix: string;
  generate(debugSuffix: ?string): string {
    let id;
    do {
      id = this.prefix + base62.encode(this.uidCounter++);
      if (this.uniqueSuffix.length > 0) id += this.uniqueSuffix;
      if (this.debugNames) {
        if (debugSuffix)
          id += "_" + debugSuffix.replace(/[.,:]/g, "_");
        else
          id += "_";
      }
    } while (this.forbiddenNames.has(id));
    return id;
  }
}

export class PreludeGenerator {
  constructor(debugNames: ?boolean, uniqueSuffix: ?string) {
    this.prelude = [];
    this.derivedIds = new Map();
    this.memoizedRefs = new Map();
    this.nameGenerator = new NameGenerator(new Set(), !!debugNames, uniqueSuffix || "", "_$");
    this.usesThis = false;
    this.declaredGlobals = new Set();
  }

  prelude: Array<BabelNodeStatement>;
  derivedIds: Map<string, Array<Value>>;
  memoizedRefs: Map<string, BabelNodeIdentifier | BabelNodeMemberExpression | BabelNodeThisExpression>;
  nameGenerator: NameGenerator;
  usesThis: boolean;
  declaredGlobals: Set<string>;

  createNameGenerator(prefix: string): NameGenerator {
    return new NameGenerator(this.nameGenerator.forbiddenNames, this.nameGenerator.debugNames, this.nameGenerator.uniqueSuffix, prefix);
  }

  convertStringToMember(str: string): BabelNodeIdentifier | BabelNodeMemberExpression | BabelNodeThisExpression {
    return str
      .split(".")
      .map((name) => {
        if (name === "::global") {
          this.usesThis = true;
          return t.thisExpression();
        } else {
          return t.identifier(name);
        }
      })
      .reduce((obj, prop) => t.memberExpression(obj, prop));
  }

  globalReference(key: string, globalScope: boolean = false) {
    if (globalScope && t.isValidIdentifier(key)) return t.identifier(key);
    let keyNode = t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key);
    return t.memberExpression(this.memoizeReference("::global"), keyNode, !t.isIdentifier(keyNode));
  }

  memoizeReference(key: string): BabelNodeIdentifier | BabelNodeMemberExpression | BabelNodeThisExpression {
    let ref = this.memoizedRefs.get(key);
    if (ref) return ref;

    ref = t.identifier(this.nameGenerator.generate(key));
    this.prelude.push(t.variableDeclaration("var", [
      t.variableDeclarator(ref, this.convertStringToMember(key))
    ]));
    this.memoizedRefs.set(key, ref);
    return ref;
  }
}
