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
  type SerializationContext,
  type OperationDescriptor,
  type OperationDescriptorData,
} from "../utils/generator.js";
import { PreludeGenerator } from "../utils/PreludeGenerator.js";
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
import type {
  BabelNodeBlockStatement,
  BabelNodeExpression,
  BabelNodeSpreadElement,
  BabelNodeStringLiteral,
} from "@babel/types";
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

export class ResidualOperationSerializer {
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
    operationDescriptor: OperationDescriptor,
    nodes: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ): BabelNodeStatement | BabelNodeExpression {
    let { data, kind, type } = operationDescriptor;
    let babelNode;

    switch (type) {
      case "IDENTIFIER":
        babelNode = this._serializeIdentifier(data, nodes);
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
        babelNode = this._serializeGlobalDelete(data, nodes);
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
        babelNode = this._serializeModulesRequires(data, nodes);
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
        babelNode = this._serializeIdentifier(data, nodes);
        break;
      case "WIDEN_PROPERTY":
        babelNode = this._serializeWidenProperty(data, nodes);
        break;
      case "WIDEN_PROPERTY_ASSIGNMENT":
        babelNode = this._serializeWidenPropertyAssignment(data, nodes);
        break;
      case "TO_STRING":
        babelNode = this._serializeToString(data, nodes);
        break;
      case "TO_LOCALE_STRING":
        babelNode = this._serializeToLocaleString(data, nodes);
        break;
      case "STRING_SLICE":
        babelNode = this._serializeStringSlice(data, nodes);
        break;
      case "STRING_SPLIT":
        babelNode = this._serializeStringSplit(data, nodes);
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

      // React
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
        babelNode = this._serializeReactNativeStringLiteral(data, nodes);
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
        invariant(false, `operation descriptor "type" not recognized when serializing operation descriptor`);
    }

    if (kind === "DERIVED") {
      return this._serializeDerivedOperationDescriptor(data, ((babelNode: any): BabelNodeExpression));
    } else if (kind === "VOID") {
      return this._serializeVoidOperationDescriptor(((babelNode: any): BabelNodeExpression));
    }
    return babelNode;
  }

  _serializeStringSplit(data: OperationDescriptorData, [a, b, c]: Array<BabelNodeExpression>) {
    return t.callExpression(t.memberExpression(a, t.identifier("split")), [b, c]);
  }

  _serializeStringSlice(data: OperationDescriptorData, [a, b, c]: Array<BabelNodeExpression>) {
    return t.callExpression(t.memberExpression(a, t.identifier("slice")), [b, c]);
  }

  _serializeToString(data: OperationDescriptorData, [node]: Array<BabelNodeExpression>) {
    return t.callExpression(t.memberExpression(node, t.identifier("toString")), []);
  }

  _serializeToLocaleString(data: OperationDescriptorData, [node]: Array<BabelNodeExpression>) {
    return t.callExpression(t.memberExpression(node, t.identifier("toLocaleString")), []);
  }

  _serializeAppendGenerator(
    { generator }: OperationDescriptorData,
    [leadingCommentNode]: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ) {
    invariant(context !== undefined);
    invariant(generator !== undefined);
    invariant(valuesToProcess !== undefined);
    let leadingComment = ((leadingCommentNode: any): BabelNodeStringLiteral).value;
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

  _serializeAssumeCall(data: OperationDescriptorData, [c, s]: Array<BabelNodeExpression>) {
    let errorLiteral = s.type === "StringLiteral" ? s : t.stringLiteral("Assumption violated");
    return t.ifStatement(
      t.unaryExpression("!", c),
      t.blockStatement([t.throwStatement(t.newExpression(t.identifier("Error"), [errorLiteral]))])
    );
  }

  _serializeWidenPropertyAssignment(data: OperationDescriptorData, [o, propName, v]: Array<BabelNodeExpression>) {
    return t.assignmentExpression("=", memberExpressionHelper(o, propName), v);
  }

  _serializeWidenAbstractProperty(data: OperationDescriptorData, [o, p]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(o, p);
  }

  _serializeWidenProperty(data: OperationDescriptorData, [o, propName]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(o, propName);
  }

  _serializeAbstractObjectGet({ propertyGetter }: OperationDescriptorData, [o, P]: Array<BabelNodeExpression>) {
    return propertyGetter !== undefined
      ? t.callExpression(t.memberExpression(t.identifier("global"), t.identifier("__prop_" + propertyGetter)), [o, P])
      : memberExpressionHelper(o, P);
  }

  _serializeAbstractObjectGetProtoOf(data: OperationDescriptorData, [p]: Array<BabelNodeExpression>) {
    invariant(this.realm.preludeGenerator !== undefined);
    let getPrototypeOf = this.realm.preludeGenerator.memoizeReference("Object.getPrototypeOf");
    return this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION) || this.realm.isCompatibleWith("mobile")
      ? t.memberExpression(p, protoExpression)
      : t.callExpression(getPrototypeOf, [p]);
  }

  _serializeCannotBecomeObject(data: OperationDescriptorData, [n]: Array<BabelNodeExpression>) {
    let callFunc = t.identifier("global.__cannotBecomeObject");
    return t.callExpression(callFunc, [n]);
  }

  _serializeResidualCall(data: OperationDescriptorData, nodes: Array<BabelNodeExpression>) {
    return t.callExpression(nodes[0], ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeModulesRequires(data: OperationDescriptorData, [propName]: Array<BabelNodeExpression>) {
    return t.callExpression(t.identifier("require"), [propName]);
  }

  _serializeConcreteModel(data: OperationDescriptorData, [valueNode, propName]: Array<BabelNodeExpression>) {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.expressionStatement(
      t.assignmentExpression("=", this.preludeGenerator.globalReference(propString, false), valueNode)
    );
  }

  _serializeConsoleLog(data: OperationDescriptorData, [propName, ...nodes]: Array<BabelNodeExpression>) {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.expressionStatement(
      t.callExpression(t.memberExpression(t.identifier("console"), t.identifier(propString)), [...nodes])
    );
  }

  _serializeDoWhile(
    { generator, value }: OperationDescriptorData,
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

  _serializeForIn({ boundName, lh }: OperationDescriptorData, [obj, tgt, src]: Array<BabelNodeExpression>) {
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

  _serializeFullInvariant(
    data: OperationDescriptorData,
    [propName, objectNode, valueNode]: Array<BabelNodeExpression>
  ) {
    return t.binaryExpression("!==", memberExpressionHelper(objectNode, propName), valueNode);
  }

  _serializeFullInvariantFunction(data: OperationDescriptorData, [propName, objectNode]: Array<BabelNodeExpression>) {
    return t.binaryExpression(
      "!==",
      t.unaryExpression("typeof", memberExpressionHelper(objectNode, propName), true),
      t.stringLiteral("function")
    );
  }

  _serializeFullInvariantAbstract(
    { concreteComparisons, typeComparisons }: OperationDescriptorData,
    [propName, valueNode]: Array<BabelNodeExpression>
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

  _serializeInvariantAppend(data: OperationDescriptorData, [propName, objectNode]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(objectNode, propName);
  }

  _serializePropertyInvariant({ state }: OperationDescriptorData, [propName, objectNode]: Array<BabelNodeExpression>) {
    invariant(state !== undefined);
    let n = t.callExpression(
      t.memberExpression(
        this.preludeGenerator.memoizeReference("Object.prototype.hasOwnProperty"),
        t.identifier("call")
      ),
      [objectNode, propName]
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

  _serializeUpdateIncrementor({ op }: OperationDescriptorData, [oldValNode]: Array<BabelNodeExpression>) {
    invariant(op !== undefined);
    return t.binaryExpression(op, oldValNode, t.numericLiteral(1));
  }

  _serializeDerivedAbstractInvariant(
    data: OperationDescriptorData,
    [typeOfStringNode, typeofNode]: Array<BabelNodeExpression>
  ) {
    let typeofString = ((typeOfStringNode: any): BabelNodeStringLiteral).value;
    let condition = t.binaryExpression("!==", t.unaryExpression("typeof", typeofNode), t.stringLiteral(typeofString));
    if (typeofString === "object") {
      condition = t.logicalExpression(
        "&&",
        condition,
        t.binaryExpression("!==", t.unaryExpression("typeof", typeofNode), t.stringLiteral("function"))
      );
      condition = t.logicalExpression("||", condition, t.binaryExpression("===", typeofNode, nullExpression));
    }
    return condition;
  }

  _serializeInvariant(
    { appendLastToInvariantOperationDescriptor, violationConditionOperationDescriptor }: OperationDescriptorData,
    nodes: Array<BabelNodeExpression>
  ) {
    invariant(violationConditionOperationDescriptor !== undefined);
    let messageComponents = [
      t.stringLiteral("Prepack model invariant violation ("),
      t.numericLiteral(this.preludeGenerator.nextInvariantId++),
    ];
    if (appendLastToInvariantOperationDescriptor) {
      let propName = nodes[0];
      let last = nodes.pop();
      messageComponents.push(t.stringLiteral("): "));
      messageComponents.push(this.serialize(appendLastToInvariantOperationDescriptor, [propName, last]));
    } else {
      messageComponents.push(t.stringLiteral(")"));
    }
    let throwString = messageComponents[0];
    for (let i = 1; i < messageComponents.length; i++)
      throwString = t.binaryExpression("+", throwString, messageComponents[i]);
    let condition = this.serialize(violationConditionOperationDescriptor, nodes);
    let consequent = this.getErrorStatement(throwString);
    return t.ifStatement(condition, consequent);
  }

  _serializeReactRelayMockContainer(
    data: OperationDescriptorData,
    [reactRelayIdent, propName, ...otherArgs]: Array<BabelNodeExpression>
  ) {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.callExpression(
      t.memberExpression(reactRelayIdent, t.identifier(propString)),
      ((otherArgs: any): Array<any>)
    );
  }

  _serializePropertyAssignment(
    { path }: OperationDescriptorData,
    [o, p, v, e]: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ) {
    invariant(path instanceof AbstractValue);
    invariant(path.operationDescriptor !== undefined);
    let lh = this.serialize(path.operationDescriptor, [o, p], context, valuesToProcess);
    return t.expressionStatement(t.assignmentExpression("=", (lh: any), v));
  }

  _serializeConditionalPropertyAssignment(
    { path, value }: OperationDescriptorData,
    [o, v, e, keyKey]: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ) {
    invariant(value instanceof AbstractValue);
    invariant(path instanceof AbstractValue);
    let mightHaveBeenDeleted = value.mightHaveBeenDeleted();
    let mightBeUndefined = value.mightBeUndefined();
    invariant(path.operationDescriptor !== undefined);
    let lh = this.serialize(path.operationDescriptor, [o, keyKey], context, valuesToProcess);
    let r = t.expressionStatement(t.assignmentExpression("=", (lh: any), v));
    if (mightHaveBeenDeleted) {
      // If v === __empty || (v === undefined  && !(key.key in o))  then delete it
      let emptyTest = t.binaryExpression("===", v, e);
      let undefinedTest = t.binaryExpression("===", v, voidExpression);
      let inTest = t.unaryExpression("!", t.binaryExpression("in", keyKey, o));
      let guard = t.logicalExpression("||", emptyTest, t.logicalExpression("&&", undefinedTest, inTest));
      let deleteIt = t.expressionStatement(t.unaryExpression("delete", (lh: any)));
      return t.ifStatement(mightBeUndefined ? emptyTest : guard, deleteIt, r);
    }
    return r;
  }

  _serializeLogicalPropertyAssignment(
    { binding: _binding, value }: OperationDescriptorData,
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
    { value }: OperationDescriptorData,
    [v]: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ) {
    invariant(value instanceof AbstractValue);
    invariant(value.operationDescriptor !== undefined);
    let id = this.serialize(value.operationDescriptor, [], context, valuesToProcess);
    return t.expressionStatement(t.assignmentExpression("=", (id: any), v));
  }

  _serializeReactNativeStringLiteral(data: OperationDescriptorData, [propName]: Array<BabelNodeExpression>) {
    return propName;
  }

  _serializeReactCreateContextProvider(data: OperationDescriptorData, [consumerNode]: Array<BabelNodeExpression>) {
    return t.memberExpression(consumerNode, t.identifier("Provider"));
  }

  _serializeReactTemporalFunc(data: OperationDescriptorData, [renderNode, ..._args]: Array<BabelNodeExpression>) {
    return t.callExpression(renderNode, ((_args: any): Array<any>));
  }

  _serializeCallAbstractFunc(data: OperationDescriptorData, nodes: Array<BabelNodeExpression>) {
    let fun_args = ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
    return t.callExpression(nodes[0], fun_args);
  }

  _serializeCallAbstractFuncThis(data: OperationDescriptorData, nodes: Array<BabelNodeExpression>) {
    let fun_args = ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
    return t.callExpression(t.memberExpression(nodes[0], t.identifier("call")), fun_args);
  }

  _serializeDirectCallWithArgList(data: OperationDescriptorData, nodes: Array<BabelNodeExpression>) {
    let fun_args = nodes.slice(1);
    return t.callExpression(nodes[0], ((fun_args: any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeObjectProtoHasOwnProperty(
    data: OperationDescriptorData,
    [methodNode, objectNode, nameNode]: Array<BabelNodeExpression>
  ) {
    return t.callExpression(t.memberExpression(methodNode, t.identifier("call")), [objectNode, nameNode]);
  }

  _serializeRebuiltObject(data: OperationDescriptorData, [node, propName]: Array<BabelNodeExpression>) {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.isValidIdentifier(propString)
      ? t.memberExpression(node, t.identifier(propString), false)
      : t.memberExpression(node, propName, true);
  }

  _serializeGlobalDelete(data: OperationDescriptorData, [propName]: Array<BabelNodeExpression>) {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.expressionStatement(t.unaryExpression("delete", this.preludeGenerator.globalReference(propString, false)));
  }

  _serializeDefineProperty(
    { object, desc }: OperationDescriptorData,
    [propName]: Array<BabelNodeExpression>,
    context?: SerializationContext
  ) {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    invariant(object !== undefined);
    invariant(desc !== undefined);
    invariant(context !== undefined);
    return context.emitDefinePropertyBody(object, propString, desc);
  }

  _serializeFBMocksMagicGlobalFunction(data: OperationDescriptorData, [propName, ...args]: Array<BabelNodeExpression>) {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.callExpression(t.identifier(propString), ((args: any): Array<any>));
  }

  _serializeFBMocksBootloaderLoadModules(data: OperationDescriptorData, args: Array<BabelNodeExpression>) {
    return t.callExpression(
      t.memberExpression(t.identifier("Bootloader"), t.identifier("loadModules")),
      ((args: any): Array<any>)
    );
  }

  _serializeAbstractObjectSetPartial(
    data: OperationDescriptorData,
    [objectNode, keyNode, valueNode]: Array<BabelNodeExpression>
  ) {
    return t.expressionStatement(t.assignmentExpression("=", memberExpressionHelper(objectNode, keyNode), valueNode));
  }

  _serializeUnknownArrayGetPartial(data: OperationDescriptorData, [o, p]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(o, p);
  }

  _serializeObjectGetPartial(data: OperationDescriptorData, [o, p]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(o, p);
  }

  _serializeAbstractObjectGetPartial(data: OperationDescriptorData, [o, p]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(o, p);
  }

  _serializeObjectSetPartial(
    data: OperationDescriptorData,
    [objectNode, keyNode, valueNode]: Array<BabelNodeExpression>
  ) {
    return t.expressionStatement(t.assignmentExpression("=", memberExpressionHelper(objectNode, keyNode), valueNode));
  }

  _serializeIdentifier(data: OperationDescriptorData, nodes: Array<BabelNodeExpression>) {
    invariant(typeof data.id === "string");
    return t.identifier(data.id);
  }

  _serializeCoerceToString(data: OperationDescriptorData, [p]: Array<BabelNodeExpression>) {
    return t.binaryExpression("+", t.stringLiteral(""), p);
  }

  _serializeBabelHelpersObjectWithoutProperties(
    data: OperationDescriptorData,
    [methodNode, objNode, propRemoveNode]: Array<BabelNodeExpression>
  ) {
    return t.callExpression(methodNode, [objNode, propRemoveNode]);
  }

  _serializeReactDefaultPropsHelper(data: OperationDescriptorData, [methodNode, ..._args]: Array<BabelNodeExpression>) {
    return t.callExpression(methodNode, ((_args: any): Array<any>));
  }

  _serializeUnknownArrayMethodCall(data: OperationDescriptorData, [methodNode, ..._args]: Array<BabelNodeExpression>) {
    return t.callExpression(methodNode, ((_args: any): Array<any>));
  }

  _serializeUnknownArrayLength(data: OperationDescriptorData, [o]: Array<BabelNodeExpression>) {
    return t.memberExpression(o, t.identifier("length"), false);
  }

  _serializeUnknownArrayMethodPropertyCall(
    data: OperationDescriptorData,
    [objNode, propName, ..._args]: Array<BabelNodeExpression>
  ) {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.callExpression(t.memberExpression(objNode, t.identifier(propString)), ((_args: any): Array<any>));
  }

  _serializeThrow(data: OperationDescriptorData, [argument]: Array<BabelNodeExpression>) {
    return t.throwStatement(argument);
  }

  _serializeConditionalThrow(
    { value }: OperationDescriptorData,
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

  _serializeReactSSRTemplateLiteral({ quasis }: OperationDescriptorData, valueNodes: Array<BabelNodeExpression>) {
    invariant(quasis !== undefined);
    return t.templateLiteral(((quasis: any): Array<any>), valueNodes);
  }

  _serializeReactRenderValueHelper(data: OperationDescriptorData, [helperNode, valueNode]: Array<BabelNodeExpression>) {
    return t.callExpression(helperNode, [valueNode]);
  }

  _serializePropertyDelete(data: OperationDescriptorData, [objectNode, propName]: Array<BabelNodeExpression>) {
    return t.expressionStatement(t.unaryExpression("delete", memberExpressionHelper(objectNode, propName)));
  }

  _serializeGetBinding(
    { binding }: OperationDescriptorData,
    nodes: Array<BabelNodeExpression>,
    context?: SerializationContext
  ) {
    invariant(binding !== undefined);
    invariant(context !== undefined);
    return context.serializeBinding(((binding: any): Binding));
  }

  _serializeForFunctionCall(data: OperationDescriptorData, [func, thisExpr]: Array<BabelNodeExpression>) {
    let { usesThis } = data;
    return usesThis
      ? t.callExpression(t.memberExpression(func, t.identifier("call")), [thisExpr])
      : t.callExpression(func, []);
  }

  _serializeNewExpression(
    data: OperationDescriptorData,
    [constructorNode, ...argListNodes]: Array<BabelNodeExpression>
  ) {
    return t.newExpression(constructorNode, argListNodes);
  }

  _serializeEmitCall({ callTemplate }: OperationDescriptorData, nodes: Array<BabelNodeExpression>) {
    invariant(typeof callTemplate === "function");
    return t.expressionStatement(t.callExpression(callTemplate(), [...nodes]));
  }

  _serializeEmitCallAndCaptureResults({ callTemplate }: OperationDescriptorData, nodes: Array<BabelNodeExpression>) {
    invariant(typeof callTemplate === "function");
    return t.callExpression(callTemplate(), ((nodes: any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeObjectProtoGetOwnPropertyDescriptor(
    data: OperationDescriptorData,
    [funcNode, ...args]: Array<BabelNodeExpression>
  ) {
    return t.callExpression(funcNode, ((args: any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeCallBailout({ propRef, thisArg }: OperationDescriptorData, nodes: Array<BabelNodeExpression>) {
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
    { generators }: OperationDescriptorData,
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
    { value }: OperationDescriptorData,
    [objectNode, valueNode, propName]: Array<BabelNodeExpression>,
    context?: SerializationContext
  ) {
    invariant(context !== undefined);
    invariant(value instanceof Value);
    return context.getPropertyAssignmentStatement(
      memberExpressionHelper(objectNode, propName),
      value,
      value.mightHaveBeenDeleted(),
      /* deleteIfMightHaveBeenDeleted */ true
    );
  }

  _serializeGlobalAssignment(data: OperationDescriptorData, [valueNode, propName]: Array<BabelNodeExpression>) {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.expressionStatement(
      t.assignmentExpression("=", this.preludeGenerator.globalReference(propString, false), valueNode)
    );
  }

  _serializeSingleArg(data: OperationDescriptorData, [o]: Array<BabelNodeExpression>) {
    return o;
  }

  _serializeAbstractProperty(data: OperationDescriptorData, [o, propName]: Array<BabelNodeExpression>) {
    return memberExpressionHelper(o, propName);
  }

  _serializeUnaryExpression({ op, prefix }: OperationDescriptorData, [x, y]: Array<BabelNodeExpression>) {
    invariant(op !== undefined);
    return t.unaryExpression(op, x, prefix);
  }

  _serializeBinaryExpression({ op }: OperationDescriptorData, [x, y]: Array<BabelNodeExpression>) {
    invariant(op !== undefined);
    return t.binaryExpression(op, x, y);
  }

  _serializeLogicalExpression({ op }: OperationDescriptorData, [x, y]: Array<BabelNodeExpression>) {
    invariant(op !== undefined);
    return t.logicalExpression(op, x, y);
  }

  _serializeConditionalExpression(data: OperationDescriptorData, [c, x, y]: Array<BabelNodeExpression>) {
    return t.conditionalExpression(c, x, y);
  }

  _serializeDerivedOperationDescriptor(
    data: OperationDescriptorData,
    babelNode: BabelNodeExpression
  ): BabelNodeStatement {
    invariant(typeof data.id === "string");
    return t.variableDeclaration("var", [t.variableDeclarator(t.identifier(data.id), babelNode)]);
  }

  _serializeVoidOperationDescriptor(babelNode: BabelNodeExpression) {
    return t.expressionStatement(babelNode);
  }

  _serializeAbstractFromTemplate({ template }: OperationDescriptorData, nodes: Array<BabelNodeExpression>) {
    let generatorArgs = {};
    let i = 0;
    for (let node of nodes) generatorArgs[labels.charAt(i++)] = node;
    invariant(typeof template === "function");
    return template(this.preludeGenerator)(generatorArgs);
  }

  _serializeObjectAssign(data: OperationDescriptorData, [targetNode, ...sourceNodes]: Array<BabelNodeExpression>) {
    return t.callExpression(this.preludeGenerator.memoizeReference("Object.assign"), [targetNode, ...sourceNodes]);
  }
}
