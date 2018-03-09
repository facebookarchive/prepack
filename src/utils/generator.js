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
  IntegralValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { CompilerDiagnostic } from "../errors.js";
import type { AbstractValueBuildNodeFunction } from "../values/AbstractValue.js";
import { hashString } from "../methods/index.js";
import type { Descriptor } from "../types.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import * as t from "babel-types";
import invariant from "../invariant.js";
import { Completion, JoinedAbruptCompletions, ThrowCompletion, ReturnCompletion } from "../completions.js";
import type {
  BabelNodeExpression,
  BabelNodeIdentifier,
  BabelNodeThisExpression,
  BabelNodeStatement,
  BabelNodeMemberExpression,
  BabelNodeVariableDeclaration,
  BabelNodeBlockStatement,
} from "babel-types";
import { nullExpression } from "./internalizer.js";
import { Utils, concretize } from "../singletons.js";

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

type ArgsAndBuildNode = [Array<Value>, (Array<BabelNodeExpression>) => BabelNodeStatement];

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
  visitGenerator: (Generator, Generator) => void,
  canSkip: AbstractValue => boolean,
  recordDeclaration: AbstractValue => void,
  recordDelayedEntry: (Generator, GeneratorEntry) => void,
|};

function serializeBody(generator: Generator, context: SerializationContext): BabelNodeBlockStatement {
  let statements = context.serializeGenerator(generator);
  if (statements.length === 1 && statements[0].type === "BlockStatement") return (statements[0]: any);
  return t.blockStatement(statements);
}

export class Generator {
  constructor(realm: Realm, name: string) {
    invariant(realm.useAbstractInterpretation);
    let realmPreludeGenerator = realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;
    this.realm = realm;
    this._entries = [];
    this.id = realm.nextGeneratorId++;
    this._name = name;
  }

  realm: Realm;
  _entries: Array<GeneratorEntry>;
  preludeGenerator: PreludeGenerator;

  id: number;
  _name: string;

  getName(): string {
    return `${this._name}(#${this.id})`;
  }

  getAsPropertyNameExpression(key: string, canBeIdentifier: boolean = true): BabelNodeExpression {
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

  empty() {
    return this._entries.length === 0;
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

  emitConcreteModel(key: string, value: Value) {
    this._addEntry({
      args: [concretize(this.realm, value)],
      buildNode: ([valueNode]) =>
        t.expressionStatement(
          t.assignmentExpression("=", this.preludeGenerator.globalReference(key, false), valueNode)
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

  emitConditionalThrow(condition: AbstractValue, trueBranch: Completion | Value, falseBranch: Completion | Value) {
    let [args, buildfunc] = this._deconstruct(
      condition,
      trueBranch,
      falseBranch,
      completion => {
        this._issueThrowCompilerDiagnostic(completion.value);
        let serializationArgs = [completion.value];
        let func = ([arg]) => t.throwStatement(arg);
        return [serializationArgs, func];
      },
      () => [[], () => t.emptyStatement()]
    );
    this.emitStatement(args, buildfunc);
  }

  getThrowOrReturn(condition: AbstractValue, trueBranch: Completion | Value, falseBranch: Completion | Value) {
    let [args, buildfunc] = this._deconstruct(
      condition,
      trueBranch,
      falseBranch,
      completion => {
        return [[completion.value], ([arg]) => t.throwStatement(arg)];
      },
      value => [[value], ([returnValue]) => t.returnStatement(returnValue)]
    );
    return [args, buildfunc];
  }

  _deconstruct(
    condition: AbstractValue,
    trueBranch: Completion | Value,
    falseBranch: Completion | Value,
    onThrowCompletion: ThrowCompletion => ArgsAndBuildNode,
    onNormalValue: Value => ArgsAndBuildNode
  ) {
    let targs;
    let tfunc;
    let fargs;
    let ffunc;
    if (trueBranch instanceof JoinedAbruptCompletions) {
      [targs, tfunc] = this._deconstruct(
        trueBranch.joinCondition,
        trueBranch.consequent,
        trueBranch.alternate,
        onThrowCompletion,
        onNormalValue
      );
    } else if (trueBranch instanceof ThrowCompletion) {
      [targs, tfunc] = onThrowCompletion(trueBranch);
    } else {
      let value = trueBranch instanceof ReturnCompletion ? trueBranch.value : trueBranch;
      invariant(value instanceof Value);
      [targs, tfunc] = onNormalValue(value);
    }
    if (falseBranch instanceof JoinedAbruptCompletions) {
      [fargs, ffunc] = this._deconstruct(
        falseBranch.joinCondition,
        falseBranch.consequent,
        falseBranch.alternate,
        onThrowCompletion,
        onNormalValue
      );
    } else if (falseBranch instanceof ThrowCompletion) {
      [fargs, ffunc] = onThrowCompletion(falseBranch);
    } else {
      invariant(falseBranch instanceof Value);
      [fargs, ffunc] = onNormalValue(falseBranch);
    }
    let args = [condition].concat(targs).concat(fargs);
    let func = nodes => {
      return t.ifStatement(
        nodes[0],
        tfunc(nodes.slice().splice(1, targs.length)),
        ffunc(nodes.slice().splice(targs.length + 1, fargs.length))
      );
    };
    return [args, func];
  }

  _issueThrowCompilerDiagnostic(value: Value) {
    let message = "Program may terminate with exception";
    if (value instanceof ObjectValue) {
      let object = ((value: any): ObjectValue);
      let objectMessage = this.realm.evaluateWithUndo(() => object.$Get("message", value));
      if (objectMessage instanceof StringValue) message += `: ${objectMessage.value}`;
      const objectStack = this.realm.evaluateWithUndo(() => object.$Get("stack", value));
      if (objectStack instanceof StringValue)
        message += `
  ${objectStack.value}`;
    }
    const diagnostic = new CompilerDiagnostic(message, value.expressionLocation, "PP1023", "Warning");
    this.realm.handleError(diagnostic);
  }

  emitThrow(value: Value) {
    this._issueThrowCompilerDiagnostic(value);
    this.emitStatement([value], ([argument]) => t.throwStatement(argument));
  }

  // Checks the full set of possible concrete values as well as typeof
  // for any AbstractValues
  // e.g: (obj.property !== undefined && typeof obj.property !== "object")
  // NB: if the type of the AbstractValue is top, skips the invariant
  emitFullInvariant(object: ObjectValue | AbstractObjectValue, key: string, value: Value) {
    let propertyIdentifier = this.getAsPropertyNameExpression(key);
    let computed = !t.isIdentifier(propertyIdentifier);
    let accessedPropertyOf = objectNode => t.memberExpression(objectNode, propertyIdentifier, computed);
    let condition;
    if (value instanceof AbstractValue) {
      let isTop = false;
      let concreteComparisons = [];
      let typeComparisons = new Set();

      function populateComparisonsLists(absValue: AbstractValue) {
        if (absValue.kind === "abstractConcreteUnion") {
          // recurse
          for (let nestedValue of absValue.args)
            if (nestedValue instanceof ConcreteValue) {
              concreteComparisons.push(nestedValue);
            } else {
              invariant(nestedValue instanceof AbstractValue);
              populateComparisonsLists(nestedValue);
            }
        } else if (absValue.getType().isTop || absValue.getType() === Value) {
          isTop = true;
        } else {
          typeComparisons.add(absValue.getType());
        }
      }
      populateComparisonsLists(value);

      // No point in doing the invariant if we don't know the type
      // of one of the nested abstract values
      if (isTop) {
        return;
      } else {
        condition = ([valueNode]) => {
          // Create `object.property !== concreteValue`
          let checks = concreteComparisons.map(concreteValue =>
            t.binaryExpression("!==", valueNode, t.valueToNode(concreteValue.serialize()))
          );
          // Create `typeof object.property !== typeValue`
          checks = checks.concat(
            [...typeComparisons].map(typeValue => {
              let typeString = Utils.typeToString(typeValue);
              invariant(typeString !== undefined, typeValue);
              return t.binaryExpression(
                "!==",
                t.unaryExpression("typeof", valueNode, true),
                t.stringLiteral(typeString)
              );
            })
          );
          return checks.reduce((expr, newCondition) => t.logicalExpression("&&", expr, newCondition));
        };
        this.emitInvariant([value, value], condition, valueNode => valueNode);
      }
    } else {
      condition = ([objectNode, valueNode]) => t.binaryExpression("!==", accessedPropertyOf(objectNode), valueNode);
      this.emitInvariant([object, value, object], condition, objnode => accessedPropertyOf(objnode));
    }
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
    let res = new Constructor(this.realm, types, values, hashString(id.name), [], id, options);
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
    else if (type === IntegralValue) typeofString = "number";
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
            if (statements.length === 0) continue;
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
      callbacks.recordDelayedEntry(this, entry);
    } else {
      if (entry.declared) callbacks.recordDeclaration(entry.declared);
      callbacks.visitValues(entry.args);
      if (entry.dependencies) for (let dependency of entry.dependencies) callbacks.visitGenerator(dependency, this);
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
// so we replace these character instances with an underscore
function replaceInvalidCharactersWithUnderscore(string: string) {
  return string.replace(/[.,:\(\)\"\'\`\[\]\-]/g, "_");
}

const base62characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function base62encode(n: number): string {
  invariant((n | 0) === n && n >= 0);
  if (n === 0) return "0";
  let s = "";
  while (n > 0) {
    let f = n % base62characters.length;
    s = base62characters[f] + s;
    n = (n - f) / base62characters.length;
  }
  return s;
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
      id = this.prefix + base62encode(this.uidCounter++);
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

  convertStringToMember(str: string): BabelNodeIdentifier | BabelNodeThisExpression | BabelNodeMemberExpression {
    return str
      .split(".")
      .map(name => {
        if (name === "global") {
          return this.memoizeReference(name);
        } else if (name === "this") {
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
