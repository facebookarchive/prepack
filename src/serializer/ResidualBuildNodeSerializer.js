/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import {
  Generator,
  PreludeGenerator,
  type SerializationContext,
  type ResidualBuildNode,
  type ResidualBuildNodeData,
} from "../utils/generator";
import {
  emptyExpression,
  memberExpressionHelper,
  nullExpression,
  protoExpression,
  voidExpression,
} from "../utils/babelhelpers.js";
import invariant from "../invariant.js";
import { type Binding } from "../environment.js";
import * as t from "@babel/types";
import { AbstractValue, EmptyValue, ObjectValue, Value } from "../values/index.js";
import type { BabelNodeBlockStatement, BabelNodeExpression, BabelNodeSpreadElement } from "@babel/types";
import { Utils } from "../singletons.js";
import type { PropertyBinding } from "../types.js";

const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function serializeBody(
  generator: Generator,
  context: SerializationContext,
  valuesToProcess: Set<AbstractValue | ObjectValue>
): BabelNodeBlockStatement {
  let statements = context.serializeGenerator(generator, valuesToProcess);
  if (statements.length === 1 && statements[0].type === "BlockStatement") return (statements[0]: any);
  return t.blockStatement(statements);
}

function isSelfReferential(value: Value, pathNode: void | AbstractValue): boolean {
  if (value === pathNode) return true;
  if (value instanceof AbstractValue && pathNode !== undefined) {
    for (let v of value.args) {
      if (isSelfReferential(v, pathNode)) return true;
    }
  }
  return false;
}

export class ResidualBuildNodeSerializer {
  constructor(realm: Realm, preludeGenerator: PreludeGenerator) {
    this.realm = realm;
    this.preludeGenerator = preludeGenerator;
  }
  realm: Realm;
  preludeGenerator: PreludeGenerator;

  getErrorStatement(message: BabelNodeExpression): BabelNodeStatement {
    if (this.realm.invariantMode === "throw")
      return t.throwStatement(t.newExpression(this.preludeGenerator.memoizeReference("Error"), [message]));
    else {
      let targetReference = this.realm.invariantMode;
      let args = [message];
      let i = targetReference.indexOf("+");
      if (i !== -1) {
        let s = targetReference.substr(i + 1);
        let x = Number.parseInt(s, 10);
        args.push(isNaN(x) ? t.stringLiteral(s) : t.numericLiteral(x));
        targetReference = targetReference.substr(0, i);
      }
      return t.expressionStatement(t.callExpression(this.preludeGenerator.memoizeReference(targetReference), args));
    }
  }

  serialize(
    buildNode: ResidualBuildNode,
    nodes: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ): BabelNodeStatement | BabelNodeExpression {
    let { data, kind, type } = buildNode;
    let babelNode;

    switch (type) {
      case "IDENTIFIER":
        babelNode = this._serializeIdentifier(data);
        break;
      case "REBUILT_OBJECT":
        babelNode = this._serializeRebuiltObject(data, nodes);
        break;
      case "FOR_IN":
        babelNode = this._serializeForIn(data, nodes);
        break;
      case "DO_WHILE":
        babelNode = this._serializeDoWhile(data, nodes, context, valuesToProcess);
        break;
      case "APPEND_GENERATOR":
        babelNode = this._serializeAppendGenerator(data, nodes, context, valuesToProcess);
        break;
      case "JOIN_GENERATORS":
        babelNode = this._serializeJoinGenerators(data, nodes, context, valuesToProcess);
        break;
      case "BINARY_EXPRESSION":
        babelNode = this._serializeBinaryExpression(data, nodes);
        break;
      case "LOGICAL_EXPRESSION":
        babelNode = this._serializeLogicalExpression(data, nodes);
        break;
      case "CONDITIONAL_EXPRESSION":
        babelNode = this._serializeConditionalExpression(data, nodes);
        break;
      case "UNARY_EXPRESSION":
        babelNode = this._serializeUnaryExpression(data, nodes);
        break;
      case "ABSTRACT_PROPERTY":
        babelNode = this._serializeAbstractProperty(data, nodes);
        break;
      case "ABSTRACT_FROM_TEMPLATE":
        babelNode = this._serializeAbstractFromTemplate(data, nodes);
        break;
      case "GLOBAL_ASSIGNMENT":
        babelNode = this._serializeGlobalAssignment(data, nodes);
        break;
      case "GLOBAL_DELETE":
        babelNode = this._serializeGlobalDelete(data);
        break;
      case "EMIT_PROPERTY_ASSIGNMENT":
        babelNode = this._serializeEmitPropertyAssignment(data, nodes, context);
        break;
      case "PROPERTY_DELETE":
        babelNode = this._serializePropertyDelete(data, nodes);
        break;
      case "THROW":
        babelNode = this._serializeThrow(data, nodes);
        break;
      case "CONDITIONAL_THROW":
        babelNode = this._serializeConditionalThrow(data, nodes, context);
        break;
      case "COERCE_TO_STRING":
        babelNode = this._serializeCoerceToString(data, nodes);
        break;
      case "OBJECT_ASSIGN":
        babelNode = this._serializeObjectAssign(data, nodes);
        break;
      case "SINGLE_ARG":
        babelNode = this._serializeSingleArg(data, nodes);
        break;
      case "CALL_BAILOUT":
        babelNode = this._serializeCallBailout(data, nodes);
        break;
      case "EMIT_CALL":
        babelNode = this._serializeEmitCall(data, nodes);
        break;
      case "EMIT_CALL_AND_CAPTURE_RESULT":
        babelNode = this._serializeEmitCallAndCaptureResults(data, nodes);
        break;
      case "CONCRETE_MODEL":
        babelNode = this._serializeConcreteModel(data, nodes);
        break;
      case "NEW_EXPRESSION":
        babelNode = this._serializeNewExpression(data, nodes);
        break;
      case "FOR_STATEMENT_FUNC":
        babelNode = this._serializeForFunctionCall(data, nodes);
        break;
      case "GET_BINDING":
        babelNode = this._serializeGetBinding(data, nodes, context);
        break;
      case "UNKNOWN_ARRAY_METHOD_CALL":
        babelNode = this._serializeUnknownArrayMethodCall(data, nodes);
        break;
      case "UNKNOWN_ARRAY_METHOD_PROPERTY_CALL":
        babelNode = this._serializeUnknownArrayMethodPropertyCall(data, nodes);
        break;
      case "UNKNOWN_ARRAY_LENGTH":
        babelNode = this._serializeUnknownArrayLength(data, nodes);
        break;
      case "UNKNOWN_ARRAY_GET_PARTIAL":
        babelNode = this._serializeUnknownArrayGetPartial(data, nodes);
        break;
      case "OBJECT_SET_PARTIAL":
        babelNode = this._serializeObjectSetPartial(data, nodes);
        break;
      case "OBJECT_GET_PARTIAL":
        babelNode = this._serializeObjectGetPartial(data, nodes);
        break;
      case "ABSTRACT_OBJECT_GET_PARTIAL":
        babelNode = this._serializeAbstractObjectGetPartial(data, nodes);
        break;
      case "ABSTRACT_OBJECT_SET_PARTIAL":
        babelNode = this._serializeAbstractObjectSetPartial(data, nodes);
        break;
      case "ABSTRACT_OBJECT_SET_PARTIAL_VALUE":
        babelNode = this._serializeAbstractObjectSetPartialValue(data, nodes);
        break;
      case "ABSTRACT_OBJECT_GET_PROTO_OF":
        babelNode = this._serializeAbstractObjectGetProtoOf(data, nodes);
        break;
      case "ABSTRACT_OBJECT_GET":
        babelNode = this._serializeAbstractObjectGet(data, nodes);
        break;
      case "DEFINE_PROPERTY":
        babelNode = this._serializeDefineProperty(data, nodes, context);
        break;
      case "OBJECT_PROTO_HAS_OWN_PROPERTY":
        babelNode = this._serializeObjectProtoHasOwnProperty(data, nodes);
        break;
      case "OBJECT_PROTO_GET_OWN_PROPERTY_DESCRIPTOR":
        babelNode = this._serializeObjectProtoGetOwnPropertyDescriptor(data, nodes);
        break;
      case "DIRECT_CALL_WITH_ARG_LIST":
        babelNode = this._serializeDirectCallWithArgList(data, nodes);
        break;
      case "CALL_ABSTRACT_FUNC":
        babelNode = this._serializeCallAbstractFunc(data, nodes);
        break;
      case "CALL_ABSTRACT_FUNC_THIS":
        babelNode = this._serializeCallAbstractFuncThis(data, nodes);
        break;
      case "LOCAL_ASSIGNMENT":
        babelNode = this._serializeLocalAssignment(data, nodes, context, valuesToProcess);
        break;
      case "LOGICAL_PROPERTY_ASSIGNMENT":
        babelNode = this._serializeLogicalPropertyAssignment(data, nodes);
        break;
      case "CONDITIONAL_PROPERTY_ASSIGNMENT":
        babelNode = this._serializeConditionalPropertyAssignment(data, nodes, context, valuesToProcess);
        break;
      case "PROPERTY_ASSIGNMENT":
        babelNode = this._serializePropertyAssignment(data, nodes, context, valuesToProcess);
        break;
      case "UPDATE_INCREMENTOR":
        babelNode = this._serializeUpdateIncrementor(data, nodes);
        break;
      case "CONSOLE_LOG":
        babelNode = this._serializeConsoleLog(data, nodes);
        break;
      case "MODULES_REQUIRE":
        babelNode = this._serializeModulesRequires(data);
        break;
      case "RESIDUAL_CALL":
        babelNode = this._serializeResidualCall(data, nodes);
        break;
      case "ASSUME_CALL":
        babelNode = this._serializeAssumeCall(data, nodes);
        break;
      case "CANNOT_BECOME_OBJECT":
        babelNode = this._serializeCannotBecomeObject(data, nodes);
        break;
      case "WIDENED_IDENTIFIER":
        babelNode = this._serializeIdentifier(data);
        break;
      case "WIDEN_PROPERTY":
        babelNode = this._serializeWidenProperty(data, nodes);
        break;
      case "WIDEN_ABSTRACT_PROPERTY":
        babelNode = this._serializeWidenAbstractProperty(data, nodes);
        break;
      case "WIDEN_PROPERTY_ASSIGNMENT":
        babelNode = this._serializeWidenPropertyAssignment(data, nodes);
        break;
      case "WIDEN_ABSTRACT_PROPERTY_ASSIGNMENT":
        babelNode = this._serializeWidenAbstractPropertyAssignment(data, nodes);
        break;

      // Invariants
      case "INVARIANT":
        babelNode = this._serializeInvariant(data, nodes);
        break;
      case "DERIVED_ABSTRACT_INVARIANT":
        babelNode = this._serializeDerivedAbstractInvariant(data, nodes);
        break;
      case "PROPERTY_INVARIANT":
        babelNode = this._serializePropertyInvariant(data, nodes);
        break;
      case "INVARIANT_APPEND":
        babelNode = this._serializeInvariantAppend(data, nodes);
        break;
      case "FULL_INVARIANT":
        babelNode = this._serializeFullInvariant(data, nodes);
        break;
      case "FULL_INVARIANT_ABSTRACT":
        babelNode = this._serializeFullInvariantAbstract(data, nodes);
        break;
      case "FULL_INVARIANT_FUNCTION":
        babelNode = this._serializeFullInvariantFunction(data, nodes);
        break;

      // React build nodes
      case "REACT_DEFAULT_PROPS_HELPER":
        babelNode = this._serializeReactDefaultPropsHelper(data, nodes);
        break;
      case "REACT_SSR_REGEX_CONSTANT":
        return t.variableDeclaration("var", [
          t.variableDeclarator(t.identifier("matchHtmlRegExp"), t.regExpLiteral("[\"'&<>]")),
        ]);
      case "REACT_SSR_PREV_TEXT_NODE":
        return t.variableDeclaration("var", [
          t.variableDeclarator(t.identifier("previousWasTextNode"), t.booleanLiteral(false)),
        ]);
      case "REACT_SSR_RENDER_VALUE_HELPER":
        babelNode = this._serializeReactRenderValueHelper(data, nodes);
        break;
      case "REACT_SSR_TEMPLATE_LITERAL":
        babelNode = this._serializeReactSSRTemplateLiteral(data, nodes);
        break;
      case "REACT_TEMPORAL_FUNC":
        babelNode = this._serializeReactTemporalFunc(data, nodes);
        break;
      case "REACT_CREATE_CONTEXT_PROVIDER":
        babelNode = this._serializeReactCreateContextProvider(data, nodes);
        break;
      case "REACT_NATIVE_STRING_LITERAL":
        babelNode = this._serializeReactNativeStringLiteral(data);
        break;
      case "REACT_RELAY_MOCK_CONTAINER":
        babelNode = this._serializeReactRelayMockContainer(data, nodes);
        break;

      // FB Mocks
      case "FB_MOCKS_BOOTLOADER_LOAD_MODULES":
        babelNode = this._serializeFBMocksBootloaderLoadModules(data, nodes);
        break;
      case "FB_MOCKS_MAGIC_GLOBAL_FUNCTION":
        babelNode = this._serializeFBMocksMagicGlobalFunction(data, nodes);
        break;

      // Babel helpers
      case "BABEL_HELPERS_OBJECT_WITHOUT_PROPERTIES":
        babelNode = this._serializeBabelHelpersObjectWithoutProperties(data, nodes);
        break;
      default:
        invariant(false, `build node "type" not recognized when serializing build node`);
    }

    if (kind === "DERIVED") {
      return this._serializeDerivedBuildNode(data, ((babelNode: any): BabelNodeExpression));
    } else if (kind === "VOID") {
      return this._serializeVoidBuildNode(((babelNode: any): BabelNodeExpression));
    }
    return babelNode;
  }

  _serializeAppendGenerator(
    { generator, propName: leadingComment }: ResidualBuildNodeData,
    node: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ) {
    invariant(context !== undefined);
    invariant(generator !== undefined);
    invariant(leadingComment !== undefined);
    invariant(valuesToProcess !== undefined);
    let statements = context.serializeGenerator(generator, valuesToProcess);
    if (statements.length === 1) {
      let statement = statements[0];
      if (leadingComment.length > 0)
        statement.leadingComments = [({ type: "BlockComment", value: leadingComment }: any)];
      return statement;
    }
    let block = t.blockStatement(statements);
    if (leadingComment.length > 0) {
      block.leadingComments = [({ type: "BlockComment", value: leadingComment }: any)];
    }
    return block;
  }

  _serializeAssumeCall(data: ResidualBuildNodeData, [c, s]: Array<BabelNodeExpression>) {
    let errorLiteral = s.type === "StringLiteral" ? s : t.stringLiteral("Assumption violated");
    return t.ifStatement(
      t.unaryExpression("!", c),
      t.blockStatement([t.throwStatement(t.newExpression(t.identifier("Error"), [errorLiteral]))])
    );
  }

  _serializeWidenAbstractPropertyAssignment(data: ResidualBuildNodeData, [o, p, v]: Array<BabelNodeExpression>) {
    return t.assignmentExpression("=", memberExpressionHelper(o, p), v);
  }

  _serializeWidenPropertyAssignment({ propName }: ResidualBuildNodeData, [o, v]: Array<BabelNodeExpression>) {
    invariant(typeof propName === "string");
    return t.assignmentExpression("=", memberExpressionHelper(o, propName), v);
  }

  _serializeWidenAbstractProperty(data: ResidualBuildNodeData, [o, p]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(o, p);
  }

  _serializeWidenProperty({ propName }: ResidualBuildNodeData, [o]: Array<BabelNodeExpression>) {
    invariant(typeof propName === "string");
    return memberExpressionHelper(o, propName);
  }

  _serializeAbstractObjectGet({ propertyGetter, propName: P }: ResidualBuildNodeData, [o]: Array<BabelNodeExpression>) {
    invariant(typeof P === "string");
    return propertyGetter !== undefined
      ? t.callExpression(t.memberExpression(t.identifier("global"), t.identifier("__prop_" + propertyGetter)), [
          o,
          t.stringLiteral(P),
        ])
      : memberExpressionHelper(o, P);
  }

  _serializeAbstractObjectGetProtoOf(data: ResidualBuildNodeData, [p]: Array<BabelNodeExpression>) {
    invariant(this.realm.preludeGenerator !== undefined);
    let getPrototypeOf = this.realm.preludeGenerator.memoizeReference("Object.getPrototypeOf");
    return this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION) || this.realm.isCompatibleWith("mobile")
      ? t.memberExpression(p, protoExpression)
      : t.callExpression(getPrototypeOf, [p]);
  }

  _serializeCannotBecomeObject(data: ResidualBuildNodeData, [n]: Array<BabelNodeExpression>) {
    let callFunc = t.identifier("global.__cannotBecomeObject");
    return t.callExpression(callFunc, [n]);
  }

  _serializeResidualCall(data: ResidualBuildNodeData, nodes: Array<BabelNodeExpression>) {
    return t.callExpression(nodes[0], ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeModulesRequires({ propName }: ResidualBuildNodeData) {
    invariant(propName !== undefined);
    return t.callExpression(t.identifier("require"), [t.valueToNode(propName)]);
  }

  _serializeConcreteModel({ propName }: ResidualBuildNodeData, [valueNode]: Array<BabelNodeExpression>) {
    invariant(propName !== undefined);
    return t.expressionStatement(
      t.assignmentExpression("=", this.preludeGenerator.globalReference(propName, false), valueNode)
    );
  }

  _serializeConsoleLog({ propName }: ResidualBuildNodeData, nodes: Array<BabelNodeExpression>) {
    invariant(propName !== undefined);
    return t.expressionStatement(
      t.callExpression(t.memberExpression(t.identifier("console"), t.identifier(propName)), [...nodes])
    );
  }

  _serializeDoWhile(
    { generator, value }: ResidualBuildNodeData,
    nodes: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ) {
    invariant(context !== undefined);
    invariant(valuesToProcess !== undefined);
    invariant(value !== undefined);
    let testId = value.intrinsicName;
    invariant(testId !== undefined);
    invariant(generator !== undefined);
    let statements = context.serializeGenerator(generator, valuesToProcess);
    let block = t.blockStatement(statements);
    return t.doWhileStatement(t.identifier(testId), block);
  }

  _serializeForIn({ boundName, lh }: ResidualBuildNodeData, [obj, tgt, src]: Array<BabelNodeExpression>) {
    invariant(boundName !== undefined);
    invariant(lh !== undefined);
    return t.forInStatement(
      lh,
      obj,
      t.blockStatement([
        t.expressionStatement(
          t.assignmentExpression("=", memberExpressionHelper(tgt, boundName), memberExpressionHelper(src, boundName))
        ),
      ])
    );
  }

  _serializeFullInvariant({ propName }: ResidualBuildNodeData, [objectNode, valueNode]: Array<BabelNodeExpression>) {
    invariant(propName !== undefined);
    return t.binaryExpression("!==", memberExpressionHelper(objectNode, propName), valueNode);
  }

  _serializeFullInvariantFunction({ propName }: ResidualBuildNodeData, [objectNode]: Array<BabelNodeExpression>) {
    invariant(typeof propName === "string");
    return t.binaryExpression(
      "!==",
      t.unaryExpression("typeof", memberExpressionHelper(objectNode, propName), true),
      t.stringLiteral("function")
    );
  }

  _serializeFullInvariantAbstract(
    { concreteComparisons, typeComparisons }: ResidualBuildNodeData,
    [valueNode]: Array<BabelNodeExpression>
  ) {
    invariant(concreteComparisons !== undefined);
    invariant(typeComparisons !== undefined);
    // Create `object.property !== concreteValue`
    let checks = concreteComparisons.map(concreteValue =>
      t.binaryExpression("!==", valueNode, t.valueToNode(concreteValue.serialize()))
    );
    // Create `typeof object.property !== typeValue`
    checks = checks.concat(
      [...typeComparisons].map(typeValue => {
        let typeString = Utils.typeToString(typeValue);
        invariant(typeString !== undefined, typeValue);
        return t.binaryExpression("!==", t.unaryExpression("typeof", valueNode, true), t.stringLiteral(typeString));
      })
    );
    return checks.reduce((expr, newCondition) => t.logicalExpression("&&", expr, newCondition));
  }

  _serializeInvariantAppend({ propName }: ResidualBuildNodeData, [objectNode]: Array<BabelNodeExpression>) {
    invariant(typeof propName === "string");
    return memberExpressionHelper(objectNode, propName);
  }

  _serializePropertyInvariant({ propName, state }: ResidualBuildNodeData, [objectNode]: Array<BabelNodeExpression>) {
    invariant(state !== undefined);
    invariant(typeof propName === "string");
    let n = t.callExpression(
      t.memberExpression(
        this.preludeGenerator.memoizeReference("Object.prototype.hasOwnProperty"),
        t.identifier("call")
      ),
      [objectNode, t.stringLiteral(propName)]
    );
    if (state !== "MISSING") {
      n = t.unaryExpression("!", n, true);
      if (state === "DEFINED")
        n = t.logicalExpression(
          "||",
          n,
          t.binaryExpression("===", memberExpressionHelper(objectNode, propName), t.valueToNode(undefined))
        );
    }
    return n;
  }

  _serializeUpdateIncrementor({ op }: ResidualBuildNodeData, [oldValNode]: Array<BabelNodeExpression>) {
    invariant(op !== undefined);
    return t.binaryExpression(op, oldValNode, t.numericLiteral(1));
  }

  _serializeDerivedAbstractInvariant({ typeofString }: ResidualBuildNodeData, nodes: Array<BabelNodeExpression>) {
    invariant(typeofString !== undefined);
    let condition = t.binaryExpression("!==", t.unaryExpression("typeof", nodes[0]), t.stringLiteral(typeofString));
    if (typeofString === "object") {
      condition = t.logicalExpression(
        "&&",
        condition,
        t.binaryExpression("!==", t.unaryExpression("typeof", nodes[0]), t.stringLiteral("function"))
      );
      condition = t.logicalExpression("||", condition, t.binaryExpression("===", nodes[0], nullExpression));
    }
    return condition;
  }

  _serializeInvariant(
    { appendLastToInvariantBuildNode, violationConditionBuildNode }: ResidualBuildNodeData,
    nodes: Array<BabelNodeExpression>
  ) {
    invariant(violationConditionBuildNode !== undefined);
    let messageComponents = [
      t.stringLiteral("Prepack model invariant violation ("),
      t.numericLiteral(this.preludeGenerator.nextInvariantId++),
    ];
    if (appendLastToInvariantBuildNode) {
      let last = nodes.pop();
      messageComponents.push(t.stringLiteral("): "));
      messageComponents.push(this.serialize(appendLastToInvariantBuildNode, [last]));
    } else {
      messageComponents.push(t.stringLiteral(")"));
    }
    let throwString = messageComponents[0];
    for (let i = 1; i < messageComponents.length; i++)
      throwString = t.binaryExpression("+", throwString, messageComponents[i]);
    let condition = this.serialize(violationConditionBuildNode, nodes);
    let consequent = this.getErrorStatement(throwString);
    return t.ifStatement(condition, consequent);
  }

  _serializeReactRelayMockContainer(
    { propName }: ResidualBuildNodeData,
    [reactRelayIdent, ...otherArgs]: Array<BabelNodeExpression>
  ) {
    invariant(typeof propName === "string");
    return t.callExpression(
      t.memberExpression(reactRelayIdent, t.identifier(propName)),
      ((otherArgs: any): Array<any>)
    );
  }

  _serializePropertyAssignment(
    { path }: ResidualBuildNodeData,
    [o, p, v, e]: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ) {
    invariant(path instanceof AbstractValue);
    invariant(path.buildNode !== undefined);
    let lh = this.serialize(path.buildNode, [o, p], context, valuesToProcess);
    return t.expressionStatement(t.assignmentExpression("=", (lh: any), v));
  }

  _serializeConditionalPropertyAssignment(
    { binding: _binding, path, value }: ResidualBuildNodeData,
    [o, v, e]: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ) {
    invariant(value instanceof AbstractValue);
    invariant(path instanceof AbstractValue);
    invariant(_binding !== undefined);
    let binding = ((_binding: any): PropertyBinding);
    invariant(value !== undefined);
    let keyKey = binding.key;
    invariant(typeof keyKey === "string");
    let mightHaveBeenDeleted = value.mightHaveBeenDeleted();
    let mightBeUndefined = value.mightBeUndefined();
    invariant(path.buildNode !== undefined);
    let lh = this.serialize(path.buildNode, [o, t.identifier(keyKey)], context, valuesToProcess);
    let r = t.expressionStatement(t.assignmentExpression("=", (lh: any), v));
    if (mightHaveBeenDeleted) {
      // If v === __empty || (v === undefined  && !(key.key in o))  then delete it
      let emptyTest = t.binaryExpression("===", v, e);
      let undefinedTest = t.binaryExpression("===", v, voidExpression);
      let inTest = t.unaryExpression("!", t.binaryExpression("in", t.stringLiteral(keyKey), o));
      let guard = t.logicalExpression("||", emptyTest, t.logicalExpression("&&", undefinedTest, inTest));
      let deleteIt = t.expressionStatement(t.unaryExpression("delete", (lh: any)));
      return t.ifStatement(mightBeUndefined ? emptyTest : guard, deleteIt, r);
    }
    return r;
  }

  _serializeLogicalPropertyAssignment(
    { binding: _binding, value }: ResidualBuildNodeData,
    [o, n]: Array<BabelNodeExpression>
  ) {
    invariant(value instanceof Value);
    invariant(_binding !== undefined);
    let binding = ((_binding: any): PropertyBinding);
    if (typeof binding.key === "string" && value.mightHaveBeenDeleted() && isSelfReferential(value, binding.pathNode)) {
      let inTest = t.binaryExpression("in", t.stringLiteral(binding.key), o);
      let addEmpty = t.conditionalExpression(inTest, n, emptyExpression);
      n = t.logicalExpression("||", n, addEmpty);
    }
    return n;
  }

  _serializeLocalAssignment(
    { value }: ResidualBuildNodeData,
    [v]: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ) {
    invariant(value instanceof AbstractValue);
    invariant(value.buildNode !== undefined);
    let id = this.serialize(value.buildNode, [], context, valuesToProcess);
    return t.expressionStatement(t.assignmentExpression("=", (id: any), v));
  }

  _serializeReactNativeStringLiteral({ propName }: ResidualBuildNodeData) {
    invariant(typeof propName === "string");
    return t.stringLiteral(propName);
  }

  _serializeReactCreateContextProvider(data: ResidualBuildNodeData, [consumerNode]: Array<BabelNodeExpression>) {
    return t.memberExpression(consumerNode, t.identifier("Provider"));
  }

  _serializeReactTemporalFunc(data: ResidualBuildNodeData, [renderNode, ..._args]: Array<BabelNodeExpression>) {
    return t.callExpression(renderNode, ((_args: any): Array<any>));
  }

  _serializeCallAbstractFunc(data: ResidualBuildNodeData, nodes: Array<BabelNodeExpression>) {
    let fun_args = ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
    return t.callExpression(nodes[0], fun_args);
  }

  _serializeCallAbstractFuncThis(data: ResidualBuildNodeData, nodes: Array<BabelNodeExpression>) {
    let fun_args = ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
    return t.callExpression(t.memberExpression(nodes[0], t.identifier("call")), fun_args);
  }

  _serializeDirectCallWithArgList(data: ResidualBuildNodeData, nodes: Array<BabelNodeExpression>) {
    let fun_args = nodes.slice(1);
    return t.callExpression(nodes[0], ((fun_args: any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeObjectProtoHasOwnProperty(
    data: ResidualBuildNodeData,
    [methodNode, objectNode, nameNode]: Array<BabelNodeExpression>
  ) {
    return t.callExpression(t.memberExpression(methodNode, t.identifier("call")), [objectNode, nameNode]);
  }

  _serializeRebuiltObject({ propName }: ResidualBuildNodeData, [node]: Array<BabelNodeExpression>) {
    invariant(typeof propName === "string");
    return t.isValidIdentifier(propName)
      ? t.memberExpression(node, t.identifier(propName), false)
      : t.memberExpression(node, t.stringLiteral(propName), true);
  }

  _serializeGlobalDelete({ propName }: ResidualBuildNodeData) {
    invariant(typeof propName === "string");
    return t.expressionStatement(t.unaryExpression("delete", this.preludeGenerator.globalReference(propName, false)));
  }

  _serializeDefineProperty(
    { object, propName, desc }: ResidualBuildNodeData,
    args: Array<BabelNodeExpression>,
    context?: SerializationContext
  ) {
    invariant(object !== undefined);
    invariant(propName !== undefined);
    invariant(desc !== undefined);
    invariant(context !== undefined);
    return context.emitDefinePropertyBody(object, propName, desc);
  }

  _serializeFBMocksMagicGlobalFunction({ propName }: ResidualBuildNodeData, args: Array<BabelNodeExpression>) {
    invariant(typeof propName === "string");
    return t.callExpression(t.identifier(propName), ((args: any): Array<any>));
  }

  _serializeFBMocksBootloaderLoadModules(data: ResidualBuildNodeData, args: Array<BabelNodeExpression>) {
    return t.callExpression(
      t.memberExpression(t.identifier("Bootloader"), t.identifier("loadModules")),
      ((args: any): Array<any>)
    );
  }

  _serializeAbstractObjectSetPartial(
    { propName }: ResidualBuildNodeData,
    [objectNode, valueNode]: Array<BabelNodeExpression>
  ) {
    invariant(typeof propName === "string");
    return t.expressionStatement(t.assignmentExpression("=", memberExpressionHelper(objectNode, propName), valueNode));
  }

  _serializeAbstractObjectSetPartialValue(
    data: ResidualBuildNodeData,
    [objectNode, keyNode, valueNode]: Array<BabelNodeExpression>
  ) {
    return t.expressionStatement(t.assignmentExpression("=", memberExpressionHelper(objectNode, keyNode), valueNode));
  }

  _serializeUnknownArrayGetPartial(data: ResidualBuildNodeData, [o, p]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(o, p);
  }

  _serializeObjectGetPartial(data: ResidualBuildNodeData, [o, p]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(o, p);
  }

  _serializeAbstractObjectGetPartial(data: ResidualBuildNodeData, [o, p]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(o, p);
  }

  _serializeObjectSetPartial(
    data: ResidualBuildNodeData,
    [objectNode, keyNode, valueNode]: Array<BabelNodeExpression>
  ) {
    return t.expressionStatement(t.assignmentExpression("=", memberExpressionHelper(objectNode, keyNode), valueNode));
  }

  _serializeIdentifier(data: ResidualBuildNodeData) {
    invariant(typeof data.id === "string");
    return t.identifier(data.id);
  }

  _serializeCoerceToString(data: ResidualBuildNodeData, [p]: Array<BabelNodeExpression>) {
    return t.binaryExpression("+", t.stringLiteral(""), p);
  }

  _serializeBabelHelpersObjectWithoutProperties(
    data: ResidualBuildNodeData,
    [methodNode, objNode, propRemoveNode]: Array<BabelNodeExpression>
  ) {
    return t.callExpression(methodNode, [objNode, propRemoveNode]);
  }

  _serializeReactDefaultPropsHelper(data: ResidualBuildNodeData, [methodNode, ..._args]: Array<BabelNodeExpression>) {
    return t.callExpression(methodNode, ((_args: any): Array<any>));
  }

  _serializeUnknownArrayMethodCall(data: ResidualBuildNodeData, [methodNode, ..._args]: Array<BabelNodeExpression>) {
    return t.callExpression(methodNode, ((_args: any): Array<any>));
  }

  _serializeUnknownArrayLength(data: ResidualBuildNodeData, [o]: Array<BabelNodeExpression>) {
    return t.memberExpression(o, t.identifier("length"), false);
  }

  _serializeUnknownArrayMethodPropertyCall(
    { propName }: ResidualBuildNodeData,
    [objNode, ..._args]: Array<BabelNodeExpression>
  ) {
    invariant(typeof propName === "string");
    return t.callExpression(t.memberExpression(objNode, t.identifier(propName)), ((_args: any): Array<any>));
  }

  _serializeThrow(data: ResidualBuildNodeData, [argument]: Array<BabelNodeExpression>) {
    return t.throwStatement(argument);
  }

  _serializeConditionalThrow(
    { value }: ResidualBuildNodeData,
    nodes: Array<BabelNodeExpression>,
    context?: SerializationContext
  ) {
    invariant(value instanceof Value);

    function createStatement(val: Value) {
      invariant(context !== undefined);
      if (!(val instanceof AbstractValue) || val.kind !== "conditional") {
        return t.throwStatement(context.serializeValue(val));
      }
      let [cond, trueVal, falseVal] = val.args;
      let condVal = context.serializeValue(cond);
      let trueStat, falseStat;
      if (trueVal instanceof EmptyValue) trueStat = t.blockStatement([]);
      else trueStat = createStatement(trueVal);
      if (falseVal instanceof EmptyValue) falseStat = t.blockStatement([]);
      else falseStat = createStatement(falseVal);
      return t.ifStatement(condVal, trueStat, falseStat);
    }
    return createStatement(value);
  }

  _serializeReactSSRTemplateLiteral({ quasis }: ResidualBuildNodeData, valueNodes: Array<BabelNodeExpression>) {
    invariant(quasis !== undefined);
    return t.templateLiteral(((quasis: any): Array<any>), valueNodes);
  }

  _serializeReactRenderValueHelper(data: ResidualBuildNodeData, [helperNode, valueNode]: Array<BabelNodeExpression>) {
    return t.callExpression(helperNode, [valueNode]);
  }

  _serializePropertyDelete({ propName }: ResidualBuildNodeData, [objectNode]: Array<BabelNodeExpression>) {
    invariant(propName !== undefined);
    return t.expressionStatement(t.unaryExpression("delete", memberExpressionHelper(objectNode, propName)));
  }

  _serializeGetBinding(
    { binding }: ResidualBuildNodeData,
    nodes: Array<BabelNodeExpression>,
    context?: SerializationContext
  ) {
    invariant(binding !== undefined);
    invariant(context !== undefined);
    return context.serializeBinding(((binding: any): Binding));
  }

  _serializeForFunctionCall(data: ResidualBuildNodeData, [func, thisExpr]: Array<BabelNodeExpression>) {
    let { usesThis } = data;
    return usesThis
      ? t.callExpression(t.memberExpression(func, t.identifier("call")), [thisExpr])
      : t.callExpression(func, []);
  }

  _serializeNewExpression(data: ResidualBuildNodeData, [constructorNode, ...argListNodes]: Array<BabelNodeExpression>) {
    return t.newExpression(constructorNode, argListNodes);
  }

  _serializeEmitCall({ callTemplate }: ResidualBuildNodeData, nodes: Array<BabelNodeExpression>) {
    invariant(typeof callTemplate === "function");
    return t.expressionStatement(t.callExpression(callTemplate(), [...nodes]));
  }

  _serializeEmitCallAndCaptureResults({ callTemplate }: ResidualBuildNodeData, nodes: Array<BabelNodeExpression>) {
    invariant(typeof callTemplate === "function");
    return t.callExpression(callTemplate(), ((nodes: any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeObjectProtoGetOwnPropertyDescriptor(
    data: ResidualBuildNodeData,
    [funcNode, ...args]: Array<BabelNodeExpression>
  ) {
    return t.callExpression(funcNode, ((args: any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeCallBailout({ propRef, thisArg }: ResidualBuildNodeData, nodes: Array<BabelNodeExpression>) {
    let callFunc;
    let argStart = 1;
    if (thisArg instanceof Value) {
      if (typeof propRef === "string") {
        callFunc = memberExpressionHelper(nodes[0], propRef);
      } else {
        callFunc = memberExpressionHelper(nodes[0], nodes[1]);
        argStart = 2;
      }
    } else {
      callFunc = nodes[0];
    }
    let fun_args = ((nodes.slice(argStart): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
    return t.callExpression(callFunc, fun_args);
  }

  _serializeJoinGenerators(
    { generators }: ResidualBuildNodeData,
    [cond]: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ): BabelNodeStatement {
    invariant(context !== undefined);
    invariant(valuesToProcess !== undefined);
    invariant(generators !== undefined);
    let [generator1, generator2] = generators;
    let block1 = generator1.empty() ? null : serializeBody(generator1, context, valuesToProcess);
    let block2 = generator2.empty() ? null : serializeBody(generator2, context, valuesToProcess);
    if (block1) return t.ifStatement(cond, block1, block2);
    invariant(block2);
    return t.ifStatement(t.unaryExpression("!", cond), block2);
  }

  _serializeEmitPropertyAssignment(
    { propName, value }: ResidualBuildNodeData,
    [objectNode, valueNode]: Array<BabelNodeExpression>,
    context?: SerializationContext
  ) {
    invariant(context !== undefined);
    invariant(value instanceof Value);
    invariant(typeof propName === "string");
    return context.getPropertyAssignmentStatement(
      memberExpressionHelper(objectNode, propName),
      value,
      value.mightHaveBeenDeleted(),
      /* deleteIfMightHaveBeenDeleted */ true
    );
  }

  _serializeGlobalAssignment({ propName }: ResidualBuildNodeData, [valueNode]: Array<BabelNodeExpression>) {
    invariant(typeof propName === "string");
    return t.expressionStatement(
      t.assignmentExpression("=", this.preludeGenerator.globalReference(propName, false), valueNode)
    );
  }

  _serializeSingleArg(data: ResidualBuildNodeData, [o]: Array<BabelNodeExpression>) {
    return o;
  }

  _serializeAbstractProperty({ propName }: ResidualBuildNodeData, [o]: Array<BabelNodeExpression>) {
    invariant(propName !== undefined);
    return memberExpressionHelper(o, propName);
  }

  _serializeUnaryExpression({ op, prefix }: ResidualBuildNodeData, [x, y]: Array<BabelNodeExpression>) {
    invariant(op !== undefined);
    return t.unaryExpression(op, x, prefix);
  }

  _serializeBinaryExpression({ op }: ResidualBuildNodeData, [x, y]: Array<BabelNodeExpression>) {
    invariant(op !== undefined);
    return t.binaryExpression(op, x, y);
  }

  _serializeLogicalExpression({ op }: ResidualBuildNodeData, [x, y]: Array<BabelNodeExpression>) {
    invariant(op !== undefined);
    return t.logicalExpression(op, x, y);
  }

  _serializeConditionalExpression(data: ResidualBuildNodeData, [c, x, y]: Array<BabelNodeExpression>) {
    return t.conditionalExpression(c, x, y);
  }

  _serializeDerivedBuildNode(data: ResidualBuildNodeData, babelNode: BabelNodeExpression): BabelNodeStatement {
    invariant(typeof data.id === "string");
    return t.variableDeclaration("var", [t.variableDeclarator(t.identifier(data.id), babelNode)]);
  }

  _serializeVoidBuildNode(babelNode: BabelNodeExpression) {
    return t.expressionStatement(babelNode);
  }

  _serializeAbstractFromTemplate({ template }: ResidualBuildNodeData, nodes: Array<BabelNodeExpression>) {
    let generatorArgs = {};
    let i = 0;
    for (let node of nodes) generatorArgs[labels.charAt(i++)] = node;
    invariant(typeof template === "function");
    return template(this.preludeGenerator)(generatorArgs);
  }

  _serializeObjectAssign(data: ResidualBuildNodeData, [targetNode, ...sourceNodes]: Array<BabelNodeExpression>) {
    return t.callExpression(this.preludeGenerator.memoizeReference("Object.assign"), [targetNode, ...sourceNodes]);
  }
}
