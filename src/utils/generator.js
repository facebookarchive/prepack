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
import type { Binding } from "../environment.js";
import {
  AbstractObjectValue,
  AbstractValue,
  BooleanValue,
  ConcreteValue,
  FunctionValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import type { AbstractValueBuildNodeFunction } from "../values/AbstractValue.js";
import type { Descriptor } from "../types.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import * as base62 from "base62";
import * as t from "babel-types";
import invariant from "../invariant.js";
import type {
  BabelNodeExpression,
  BabelNodeIdentifier,
  BabelNodeStatement,
  BabelNodeMemberExpression,
  BabelNodeVariableDeclaration,
  BabelNodeBlockStatement,
} from "babel-types";
import { nullExpression } from "./internalizer.js";

export type SerializationContext = {
  serializeValue: Value => BabelNodeExpression,
  serializeBinding: Binding => BabelNodeIdentifier | BabelNodeMemberExpression,
  serializeGenerator: Generator => Array<BabelNodeStatement>,
  emitDefinePropertyBody: (ObjectValue, string | SymbolValue, Descriptor) => BabelNodeStatement,
  emit: BabelNodeStatement => void,
  canOmit: AbstractValue => boolean,
  declare: AbstractValue => void,
};

export type DerivedExpressionBuildNodeFunction = (
  Array<BabelNodeExpression>,
  SerializationContext
) => BabelNodeExpression;

export type GeneratorBuildNodeFunction = (Array<BabelNodeExpression>, SerializationContext) => BabelNodeStatement;

export type GeneratorEntry = {
  declared?: AbstractValue,
  args: Array<Value>,
  // If we're just trying to add roots for the serializer to notice, we don't need a buildNode.
  buildNode?: GeneratorBuildNodeFunction,
  dependencies?: Array<Generator>,
  isPure?: boolean,
};

export type VisitEntryCallbacks = {|
  visitValues: (Array<Value>) => void,
  visitGenerator: Generator => void,
  canSkip: AbstractValue => boolean,
  recordDeclaration: AbstractValue => void,
  recordDelayedEntry: GeneratorEntry => void,
|};

function serializeBody(generator: Generator, context: SerializationContext): BabelNodeBlockStatement {
  let statements = context.serializeGenerator(generator);
  if (statements.length === 1 && statements[0].type === "BlockStatement") return (statements[0]: any);
  return t.blockStatement(statements);
}

export class Generator {
  constructor(realm: Realm, name: void | string) {
    invariant(realm.useAbstractInterpretation);
    let realmPreludeGenerator = realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;
    this.parent = realm.generator;
    this.realm = realm;
    this._entries = [];
    this.id = realm.nextGeneratorId++;
    this._name = name;
  }

  realm: Realm;
  _entries: Array<GeneratorEntry>;
  preludeGenerator: PreludeGenerator;
  parent: void | Generator;
  id: number;
  _name: void | string;

  getName(): string {
    return this._name || `#${this.id}`;
  }

  getAsPropertyNameExpression(key: string, canBeIdentifier: boolean = true) {
    // If key is a non-negative numeric string literal, parse it and set it as a numeric index instead.
    let index = Number.parseInt(key, 10);
    if (index >= 0 && index.toString() === key) {
      return t.numericLiteral(index);
    }

    if (canBeIdentifier) {
      // TODO #1020: revert this when Unicode identifiers are supported by all targetted JavaScript engines
      let keyIsAscii = /^[\u0000-\u007f]*$/.test(key);
      if (t.isValidIdentifier(key) && keyIsAscii) return t.identifier(key);
    }

    return t.stringLiteral(key);
  }

  getParent(): void | Generator {
    return this.parent;
  }

  empty() {
    return this._entries.length === 0;
  }

  // Will force the array of Values to be serialized but not emit anything for a buildNode
  appendRoots(values: Array<Value>) {
    this._addEntry({
      args: values,
    });
  }

  emitGlobalDeclaration(key: string, value: Value) {
    this.preludeGenerator.declaredGlobals.add(key);
    if (!(value instanceof UndefinedValue)) this.emitGlobalAssignment(key, value, true);
  }

  emitGlobalAssignment(key: string, value: Value, strictMode: boolean) {
    this._addEntry({
      args: [value],
      buildNode: ([valueNode]) =>
        t.expressionStatement(
          t.assignmentExpression("=", this.preludeGenerator.globalReference(key, !strictMode), valueNode)
        ),
    });
  }

  emitGlobalDelete(key: string, strictMode: boolean) {
    this._addEntry({
      args: [],
      buildNode: ([]) =>
        t.expressionStatement(t.unaryExpression("delete", this.preludeGenerator.globalReference(key, !strictMode))),
    });
  }

  emitBindingAssignment(binding: Binding, value: Value) {
    this._addEntry({
      args: [value],
      buildNode: ([valueNode], context) =>
        t.expressionStatement(
          t.assignmentExpression(
            "=",
            (context.serializeBinding(binding): BabelNodeIdentifier | BabelNodeMemberExpression),
            valueNode
          )
        ),
    });
  }

  emitPropertyAssignment(object: ObjectValue, key: string, value: Value) {
    if (object.refuseSerialization) return;
    let propName = this.getAsPropertyNameExpression(key);
    this._addEntry({
      args: [object, value],
      buildNode: ([objectNode, valueNode]) =>
        t.expressionStatement(
          t.assignmentExpression("=", t.memberExpression(objectNode, propName, !t.isIdentifier(propName)), valueNode)
        ),
    });
  }

  emitDefineProperty(object: ObjectValue, key: string, desc: Descriptor, isDescChanged: boolean = true) {
    if (object.refuseSerialization) return;
    if (desc.enumerable && desc.configurable && desc.writable && desc.value && !isDescChanged) {
      let descValue = desc.value;
      invariant(descValue instanceof Value);
      this.emitPropertyAssignment(object, key, descValue);
    } else {
      desc = Object.assign({}, desc);
      let descValue = desc.value || object.$Realm.intrinsics.undefined;
      invariant(descValue instanceof Value);
      this._addEntry({
        args: [
          object,
          descValue,
          desc.get || object.$Realm.intrinsics.undefined,
          desc.set || object.$Realm.intrinsics.undefined,
        ],
        buildNode: (_, context: SerializationContext) => context.emitDefinePropertyBody(object, key, desc),
      });
    }
  }

  emitPropertyDelete(object: ObjectValue, key: string) {
    if (object.refuseSerialization) return;
    let propName = this.getAsPropertyNameExpression(key);
    this._addEntry({
      args: [object],
      buildNode: ([objectNode]) =>
        t.expressionStatement(
          t.unaryExpression("delete", t.memberExpression(objectNode, propName, !t.isIdentifier(propName)))
        ),
    });
  }

  emitCall(createCallee: () => BabelNodeExpression, args: Array<Value>) {
    this._addEntry({
      args,
      buildNode: values => t.expressionStatement(t.callExpression(createCallee(), [...values])),
    });
  }

  emitConsoleLog(method: "log" | "warn" | "error", args: Array<string | ConcreteValue>) {
    this.emitCall(
      () => t.memberExpression(t.identifier("console"), t.identifier(method)),
      args.map(v => (typeof v === "string" ? new StringValue(this.realm, v) : v))
    );
  }

  // test must be a temporal value, which means that it must have a defined intrinsicName
  emitDoWhileStatement(test: AbstractValue, body: Generator) {
    this._addEntry({
      args: [],
      buildNode: function([], context: SerializationContext) {
        let testId = test.intrinsicName;
        invariant(testId !== undefined);
        let statements = context.serializeGenerator(body);
        let block = t.blockStatement(statements);
        return t.doWhileStatement(t.identifier(testId), block);
      },
      dependencies: [body],
    });
  }

  emitInvariant(
    args: Array<Value>,
    violationConditionFn: (Array<BabelNodeExpression>) => BabelNodeExpression,
    appendLastToInvariantFn?: BabelNodeExpression => BabelNodeExpression
  ): void {
    if (this.realm.omitInvariants) return;
    this._addEntry({
      args,
      buildNode: (nodes: Array<BabelNodeExpression>) => {
        let throwString = t.stringLiteral("Prepack model invariant violation");
        if (appendLastToInvariantFn) {
          let last = nodes.pop();
          throwString = t.binaryExpression(
            "+",
            t.stringLiteral("Prepack model invariant violation: "),
            appendLastToInvariantFn(last)
          );
        }
        let condition = violationConditionFn(nodes);
        let throwblock = t.blockStatement([t.throwStatement(t.newExpression(t.identifier("Error"), [throwString]))]);
        return t.ifStatement(condition, throwblock);
      },
    });
  }

  emitCallAndCaptureResult(
    types: TypesDomain,
    values: ValuesDomain,
    createCallee: () => BabelNodeExpression,
    args: Array<Value>,
    kind?: string
  ): AbstractValue {
    return this.derive(types, values, args, (nodes: any) => t.callExpression(createCallee(), nodes));
  }

  emitStatement(args: Array<Value>, buildNode_: (Array<BabelNodeExpression>) => BabelNodeStatement) {
    this._addEntry({
      args,
      buildNode: buildNode_,
    });
  }

  emitVoidExpression(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    buildNode_: AbstractValueBuildNodeFunction | BabelNodeExpression
  ): UndefinedValue {
    this._addEntry({
      args,
      buildNode: (nodes: Array<BabelNodeExpression>) =>
        t.expressionStatement(
          (buildNode_: any) instanceof Function
            ? ((buildNode_: any): AbstractValueBuildNodeFunction)(nodes)
            : ((buildNode_: any): BabelNodeExpression)
        ),
    });
    return this.realm.intrinsics.undefined;
  }

  emitForInStatement(
    o: ObjectValue | AbstractObjectValue,
    lh: BabelNodeVariableDeclaration,
    sourceObject: ObjectValue,
    targetObject: ObjectValue,
    boundName: BabelNodeIdentifier
  ) {
    this._addEntry({
      // duplicate args to ensure refcount > 1
      args: [o, targetObject, sourceObject, targetObject, sourceObject],
      buildNode: ([obj, tgt, src, obj1, tgt1, src1]) => {
        return t.forInStatement(
          lh,
          obj,
          t.blockStatement([
            t.expressionStatement(
              t.assignmentExpression(
                "=",
                t.memberExpression(tgt, boundName, true),
                t.memberExpression(src, boundName, true)
              )
            ),
          ])
        );
      },
    });
  }

  derive(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    buildNode_: DerivedExpressionBuildNodeFunction | BabelNodeExpression,
    optionalArgs?: {| kind?: string, isPure?: boolean, skipInvariant?: boolean |}
  ): AbstractValue {
    invariant(buildNode_ instanceof Function || args.length === 0);
    let id = t.identifier(this.preludeGenerator.nameGenerator.generate("derived"));
    this.preludeGenerator.derivedIds.set(id.name, args);
    let options = {};
    if (optionalArgs && optionalArgs.kind) options.kind = optionalArgs.kind;
    let Constructor = Value.isTypeCompatibleWith(types.getType(), ObjectValue) ? AbstractObjectValue : AbstractValue;
    let res = new Constructor(this.realm, types, values, 0, [], id, options);
    this._addEntry({
      isPure: optionalArgs ? optionalArgs.isPure : undefined,
      declared: res,
      args,
      buildNode: (nodes: Array<BabelNodeExpression>, context: SerializationContext) => {
        return t.variableDeclaration("var", [
          t.variableDeclarator(
            id,
            (buildNode_: any) instanceof Function
              ? ((buildNode_: any): DerivedExpressionBuildNodeFunction)(nodes, context)
              : ((buildNode_: any): BabelNodeExpression)
          ),
        ]);
      },
    });
    let type = types.getType();
    res.intrinsicName = id.name;
    if (optionalArgs && optionalArgs.skipInvariant) return res;
    let typeofString;
    if (type instanceof FunctionValue) typeofString = "function";
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
        nodes => {
          invariant(typeofString !== undefined);
          let condition = t.binaryExpression(
            "!==",
            t.unaryExpression("typeof", nodes[0]),
            t.stringLiteral(typeofString)
          );
          if (typeofString === "object") {
            condition = t.logicalExpression(
              "&&",
              condition,
              t.binaryExpression("!==", t.unaryExpression("typeof", nodes[0]), t.stringLiteral("function"))
            );
            condition = t.logicalExpression("||", condition, t.binaryExpression("===", nodes[0], nullExpression));
          }
          return condition;
        },
        node => node
      );
    }

    return res;
  }

  serialize(context: SerializationContext) {
    for (let entry of this._entries) {
      if (!entry.isPure || !entry.declared || !context.canOmit(entry.declared)) {
        let nodes = entry.args.map((boundArg, i) => context.serializeValue(boundArg));
        if (entry.buildNode) {
          let node = entry.buildNode(nodes, context);
          if (node.type === "BlockStatement") {
            let block: BabelNodeBlockStatement = (node: any);
            let statements = block.body;
            if (statements.length === 1) {
              node = statements[0];
            }
          }
          context.emit(node);
        }
        if (entry.declared !== undefined) context.declare(entry.declared);
      }
    }
  }

  visitEntry(entry: GeneratorEntry, callbacks: VisitEntryCallbacks) {
    if (entry.isPure && entry.declared && callbacks.canSkip(entry.declared)) {
      callbacks.recordDelayedEntry(entry);
    } else {
      if (entry.declared) callbacks.recordDeclaration(entry.declared);
      callbacks.visitValues(entry.args);
      if (entry.dependencies) for (let dependency of entry.dependencies) callbacks.visitGenerator(dependency);
    }
  }

  visit(callbacks: VisitEntryCallbacks) {
    for (let entry of this._entries) this.visitEntry(entry, callbacks);
  }

  _addEntry(entry: GeneratorEntry) {
    this._entries.push(entry);
  }

  appendGenerator(other: Generator, leadingComment: string): void {
    if (other.empty()) return;
    this._addEntry({
      args: [],
      buildNode: function(args, context: SerializationContext) {
        let statements = context.serializeGenerator(other);
        if (statements.length === 1) {
          let statement = statements[0];
          if (leadingComment.length > 0)
            statement.leadingComments = [({ type: "BlockComment", value: leadingComment }: any)];
          return statement;
        }
        let block = t.blockStatement(statements);
        if (leadingComment.length > 0) block.leadingComments = [({ type: "BlockComment", value: leadingComment }: any)];
        return block;
      },
      dependencies: [other],
    });
  }

  composeGenerators(generator1: Generator, generator2: Generator): void {
    this._addEntry({
      args: [],
      buildNode: function([], context) {
        let statements1 = generator1.empty() ? [] : context.serializeGenerator(generator1);
        let statements2 = generator2.empty() ? [] : context.serializeGenerator(generator2);
        let statements = statements1.concat(statements2);
        if (statements.length === 1) return statements[0];
        return t.blockStatement(statements);
      },
      dependencies: [generator1, generator2],
    });
  }

  joinGenerators(joinCondition: AbstractValue, generator1: Generator, generator2: Generator): void {
    this._addEntry({
      args: [joinCondition],
      buildNode: function([cond], context) {
        let block1 = generator1.empty() ? null : serializeBody(generator1, context);
        let block2 = generator2.empty() ? null : serializeBody(generator2, context);
        if (block1) return t.ifStatement(cond, block1, block2);
        invariant(block2);
        return t.ifStatement(t.unaryExpression("!", cond), block2);
      },
      dependencies: [generator1, generator2],
    });
  }
}

// some characters are invalid within a JavaScript identifier,
// such as: . , : ( ) ' " ` [ ] -
// so we replace these character instacnes with an underscore
function replaceInvalidCharactersWithUnderscore(string: string) {
  return string.replace(/[.,:\(\)\"\'\`\[\]\-]/g, "_");
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
        if (debugSuffix) id += "_" + replaceInvalidCharactersWithUnderscore(debugSuffix);
        else id += "_";
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
  memoizedRefs: Map<string, BabelNodeIdentifier>;
  nameGenerator: NameGenerator;
  usesThis: boolean;
  declaredGlobals: Set<string>;

  createNameGenerator(prefix: string): NameGenerator {
    return new NameGenerator(
      this.nameGenerator.forbiddenNames,
      this.nameGenerator.debugNames,
      this.nameGenerator.uniqueSuffix,
      prefix
    );
  }

  convertStringToMember(str: string): BabelNodeIdentifier | BabelNodeMemberExpression {
    return str
      .split(".")
      .map(name => (name === "global" ? this.memoizeReference(name) : t.identifier(name)))
      .reduce((obj, prop) => t.memberExpression(obj, prop));
  }

  globalReference(key: string, globalScope: boolean = false) {
    if (globalScope && t.isValidIdentifier(key)) return t.identifier(key);
    let keyNode = t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key);
    return t.memberExpression(this.memoizeReference("global"), keyNode, !t.isIdentifier(keyNode));
  }

  memoizeReference(key: string): BabelNodeIdentifier {
    let ref = this.memoizedRefs.get(key);
    if (ref) return ref;

    let init;
    if (key.includes("(") || key.includes("[")) {
      // Horrible but effective hack:
      // Some internal object have intrinsic names such as
      //    ([][Symbol.iterator]().__proto__.__proto__)
      // and
      //    RegExp.prototype[Symbol.match]
      // which get turned into a babel node here.
      // TODO: We should properly parse such a string, and memoize all references in it separately.
      // Instead, we just turn it into a funky identifier, which Babel seems to accept.
      init = t.identifier(key);
    } else if (key === "global") {
      this.usesThis = true;
      init = t.thisExpression();
    } else {
      let i = key.lastIndexOf(".");
      if (i === -1) {
        init = t.memberExpression(this.memoizeReference("global"), t.identifier(key));
      } else {
        init = t.memberExpression(this.memoizeReference(key.substr(0, i)), t.identifier(key.substr(i + 1)));
      }
    }
    ref = t.identifier(this.nameGenerator.generate(key));
    this.prelude.push(t.variableDeclaration("var", [t.variableDeclarator(ref, init)]));
    this.memoizedRefs.set(key, ref);
    return ref;
  }
}
