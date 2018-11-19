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
import { PreludeGenerator, Placeholders } from "../utils/PreludeGenerator.js";
import {
  emptyExpression,
  memberExpressionHelper,
  nullExpression,
  protoExpression,
  voidExpression,
} from "../utils/babelhelpers.js";
import invariant from "../invariant.js";
import * as t from "@babel/types";
import { AbstractValue, EmptyValue, ObjectValue, Value } from "../values/index.js";
import type {
  BabelNodeBlockStatement,
  BabelNodeExpression,
  BabelNodeSpreadElement,
  BabelNodeStringLiteral,
} from "@babel/types";
import { Utils } from "../singletons.js";

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

  serializeStatement(
    operationDescriptor: OperationDescriptor,
    nodes: Array<BabelNodeExpression>,
    context: SerializationContext,
    valuesToProcess: Set<AbstractValue | ObjectValue>,
    declaredId: void | string
  ): BabelNodeStatement {
    let { data, type } = operationDescriptor;
    let babelNode;

    switch (type) {
      case "ASSUME_CALL":
        babelNode = this._serializeAssumeCall(data, nodes);
        break;
      case "CONCRETE_MODEL":
        babelNode = this._serializeConcreteModel(data, nodes);
        break;
      case "CONDITIONAL_PROPERTY_ASSIGNMENT":
        babelNode = this._serializeConditionalPropertyAssignment(data, nodes, context, valuesToProcess);
        break;
      case "CONDITIONAL_THROW":
        babelNode = this._serializeConditionalThrow(data, nodes, context);
        break;
      case "CONSOLE_LOG":
        babelNode = this._serializeConsoleLog(data, nodes);
        break;
      case "DEFINE_PROPERTY":
        babelNode = this._serializeDefineProperty(data, nodes, context);
        break;
      case "DO_WHILE":
        babelNode = this._serializeDoWhile(data, nodes, context, valuesToProcess);
        break;
      case "EMIT_CALL":
        babelNode = this._serializeEmitCall(data, nodes);
        break;
      case "EMIT_PROPERTY_ASSIGNMENT":
        babelNode = this._serializeEmitPropertyAssignment(data, nodes, context);
        break;
      case "FOR_IN":
        babelNode = this._serializeForIn(data, nodes);
        break;
      case "GLOBAL_ASSIGNMENT":
        babelNode = this._serializeGlobalAssignment(data, nodes);
        break;
      case "GLOBAL_DELETE":
        babelNode = this._serializeGlobalDelete(data, nodes);
        break;
      case "JOIN_GENERATORS":
        babelNode = this._serializeJoinGenerators(data, nodes, context, valuesToProcess);
        break;
      case "LOCAL_ASSIGNMENT":
        babelNode = this._serializeLocalAssignment(data, nodes, context, valuesToProcess);
        break;
      case "NOOP":
        babelNode = t.emptyStatement();
        break;
      case "OBJECT_SET_PARTIAL":
        babelNode = this._serializeObjectSetPartial(data, nodes);
        break;
      case "PROPERTY_ASSIGNMENT":
        babelNode = this._serializePropertyAssignment(data, nodes, context, valuesToProcess);
        break;
      case "PROPERTY_DELETE":
        babelNode = this._serializePropertyDelete(data, nodes);
        break;
      case "THROW":
        babelNode = this._serializeThrow(data, nodes);
        break;

      // Invariants
      case "INVARIANT":
        babelNode = this._serializeInvariant(data, nodes);
        break;

      // React
      case "REACT_SSR_REGEX_CONSTANT":
        return t.variableDeclaration("var", [
          t.variableDeclarator(t.identifier("matchHtmlRegExp"), t.regExpLiteral("[\"'&<>]")),
        ]);
      case "REACT_SSR_PREV_TEXT_NODE":
        return t.variableDeclaration("var", [
          t.variableDeclarator(t.identifier("previousWasTextNode"), t.booleanLiteral(false)),
        ]);

      default:
        let babelNodeExpression = this.serializeExpression(operationDescriptor, nodes, context);
        if (declaredId !== undefined)
          babelNode = this._serializeDerivedOperationDescriptor(declaredId, babelNodeExpression);
        else babelNode = this._serializeVoidOperationDescriptor(babelNodeExpression);
        return babelNode;
    }

    invariant(declaredId === undefined);
    return babelNode;
  }

  serializeExpression(
    operationDescriptor: OperationDescriptor,
    nodes: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ): BabelNodeExpression {
    let { data, type } = operationDescriptor;
    let babelNode;

    switch (type) {
      case "IDENTIFIER":
        babelNode = this._serializeIdentifier(data, nodes);
        break;
      case "REBUILT_OBJECT":
        babelNode = this._serializeRebuiltObject(data, nodes);
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
      case "EMIT_CALL_AND_CAPTURE_RESULT":
        babelNode = this._serializeEmitCallAndCaptureResults(data, nodes);
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
      case "OBJECT_GET_PARTIAL":
        babelNode = this._serializeObjectGetPartial(data, nodes);
        break;
      case "ABSTRACT_OBJECT_GET_PARTIAL":
        babelNode = this._serializeAbstractObjectGetPartial(data, nodes);
        break;
      case "ABSTRACT_OBJECT_GET_PROTO_OF":
        babelNode = this._serializeAbstractObjectGetProtoOf(data, nodes);
        break;
      case "ABSTRACT_OBJECT_GET":
        babelNode = this._serializeAbstractObjectGet(data, nodes);
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
      case "LOGICAL_PROPERTY_ASSIGNMENT":
        babelNode = this._serializeLogicalPropertyAssignment(data, nodes);
        break;
      case "UPDATE_INCREMENTOR":
        babelNode = this._serializeUpdateIncrementor(data, nodes);
        break;
      case "MODULES_REQUIRE":
        babelNode = this._serializeModulesRequires(data, nodes);
        break;
      case "RESIDUAL_CALL":
        babelNode = this._serializeResidualCall(data, nodes);
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

      // Invariants
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

    return babelNode;
  }

  _serializeAssumeCall({  }: OperationDescriptorData, [c, s]: Array<BabelNodeExpression>): BabelNodeStatement {
    let errorLiteral = s.type === "StringLiteral" ? s : t.stringLiteral("Assumption violated");
    return t.ifStatement(
      t.unaryExpression("!", c),
      t.blockStatement([t.throwStatement(t.newExpression(t.identifier("Error"), [errorLiteral]))])
    );
  }

  _serializeWidenPropertyAssignment(
    {  }: OperationDescriptorData,
    [o, propName, v]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.assignmentExpression("=", memberExpressionHelper(o, propName), v);
  }

  _serializeWidenAbstractProperty(
    {  }: OperationDescriptorData,
    [o, p]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return memberExpressionHelper(o, p);
  }

  _serializeWidenProperty(
    {  }: OperationDescriptorData,
    [o, propName]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return memberExpressionHelper(o, propName);
  }

  _serializeAbstractObjectGet(
    { propertyGetter }: OperationDescriptorData,
    [o, P]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return propertyGetter !== undefined
      ? t.callExpression(t.memberExpression(t.identifier("global"), t.identifier("__prop_" + propertyGetter)), [o, P])
      : memberExpressionHelper(o, P);
  }

  _serializeAbstractObjectGetProtoOf(
    {  }: OperationDescriptorData,
    [p]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    invariant(this.realm.preludeGenerator !== undefined);
    let getPrototypeOf = this.realm.preludeGenerator.memoizeReference("Object.getPrototypeOf");
    return this.realm.isCompatibleWith(this.realm.MOBILE_JSC_VERSION) || this.realm.isCompatibleWith("mobile")
      ? t.memberExpression(p, protoExpression)
      : t.callExpression(getPrototypeOf, [p]);
  }

  _serializeCannotBecomeObject({  }: OperationDescriptorData, [n]: Array<BabelNodeExpression>): BabelNodeExpression {
    let callFunc = t.identifier("global.__cannotBecomeObject");
    return t.callExpression(callFunc, [n]);
  }

  _serializeResidualCall({  }: OperationDescriptorData, nodes: Array<BabelNodeExpression>): BabelNodeExpression {
    return t.callExpression(nodes[0], ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeModulesRequires(
    {  }: OperationDescriptorData,
    [propName]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.callExpression(t.identifier("require"), [propName]);
  }

  _serializeConcreteModel(
    {  }: OperationDescriptorData,
    [valueNode, propName]: Array<BabelNodeExpression>
  ): BabelNodeStatement {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.expressionStatement(
      t.assignmentExpression("=", this.preludeGenerator.globalReference(propString, false), valueNode)
    );
  }

  _serializeConsoleLog(
    {  }: OperationDescriptorData,
    [propName, ...nodes]: Array<BabelNodeExpression>
  ): BabelNodeStatement {
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
  ): BabelNodeStatement {
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

  _serializeForIn(
    { boundName, lh }: OperationDescriptorData,
    [obj, tgt, src]: Array<BabelNodeExpression>
  ): BabelNodeStatement {
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
    {  }: OperationDescriptorData,
    [propName, objectNode, valueNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.binaryExpression("!==", memberExpressionHelper(objectNode, propName), valueNode);
  }

  _serializeFullInvariantFunction(
    {  }: OperationDescriptorData,
    [propName, objectNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.binaryExpression(
      "!==",
      t.unaryExpression("typeof", memberExpressionHelper(objectNode, propName), true),
      t.stringLiteral("function")
    );
  }

  _serializeFullInvariantAbstract(
    { concreteComparisons, typeComparisons }: OperationDescriptorData,
    [propName, valueNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
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

  _serializeInvariantAppend(
    {  }: OperationDescriptorData,
    [propName, objectNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return memberExpressionHelper(objectNode, propName);
  }

  _serializePropertyInvariant(
    { state }: OperationDescriptorData,
    [propName, objectNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
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

  _serializeUpdateIncrementor(
    { incrementor }: OperationDescriptorData,
    [oldValNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    invariant(incrementor !== undefined);
    return t.binaryExpression(incrementor, oldValNode, t.numericLiteral(1));
  }

  _serializeDerivedAbstractInvariant(
    {  }: OperationDescriptorData,
    [typeOfStringNode, typeofNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
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
  ): BabelNodeStatement {
    invariant(violationConditionOperationDescriptor !== undefined);
    let messageComponents = [
      t.stringLiteral("Prepack model invariant violation ("),
      t.numericLiteral(this.preludeGenerator.nextInvariantId++),
    ];
    if (appendLastToInvariantOperationDescriptor) {
      let propName = nodes[0];
      let last = nodes.pop();
      messageComponents.push(t.stringLiteral("): "));
      messageComponents.push(this.serializeExpression(appendLastToInvariantOperationDescriptor, [propName, last]));
    } else {
      messageComponents.push(t.stringLiteral(")"));
    }
    let throwString = messageComponents[0];
    for (let i = 1; i < messageComponents.length; i++)
      throwString = t.binaryExpression("+", throwString, messageComponents[i]);
    let condition = this.serializeExpression(violationConditionOperationDescriptor, nodes);
    let consequent = this.getErrorStatement(throwString);
    return t.ifStatement(condition, consequent);
  }

  _serializeReactRelayMockContainer(
    {  }: OperationDescriptorData,
    [reactRelayIdent, propName, ...otherArgs]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
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
  ): BabelNodeStatement {
    invariant(path instanceof AbstractValue);
    invariant(path.operationDescriptor !== undefined);
    let lh = this.serializeExpression(path.operationDescriptor, [o, p], context, valuesToProcess);
    return t.expressionStatement(t.assignmentExpression("=", (lh: any), v));
  }

  _serializeConditionalPropertyAssignment(
    { path, value }: OperationDescriptorData,
    [o, v, e, keyKey]: Array<BabelNodeExpression>,
    context?: SerializationContext,
    valuesToProcess?: Set<AbstractValue | ObjectValue>
  ): BabelNodeStatement {
    invariant(value instanceof AbstractValue);
    invariant(path instanceof AbstractValue);
    let mightHaveBeenDeleted = value.mightHaveBeenDeleted();
    let mightBeUndefined = value.mightBeUndefined();
    invariant(path.operationDescriptor !== undefined);
    let lh = this.serializeExpression(path.operationDescriptor, [o, keyKey], context, valuesToProcess);
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
    { propertyBinding, value }: OperationDescriptorData,
    [o, n]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    invariant(value instanceof Value);
    invariant(propertyBinding !== undefined);
    if (
      typeof propertyBinding.key === "string" &&
      value.mightHaveBeenDeleted() &&
      isSelfReferential(value, propertyBinding.pathNode)
    ) {
      let inTest = t.binaryExpression("in", t.stringLiteral(propertyBinding.key), o);
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
  ): BabelNodeStatement {
    invariant(value instanceof AbstractValue);
    invariant(value.operationDescriptor !== undefined);
    let id = this.serializeExpression(value.operationDescriptor, [], context, valuesToProcess);
    return t.expressionStatement(t.assignmentExpression("=", (id: any), v));
  }

  _serializeReactNativeStringLiteral(
    {  }: OperationDescriptorData,
    [propName]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return propName;
  }

  _serializeReactCreateContextProvider(
    {  }: OperationDescriptorData,
    [consumerNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.memberExpression(consumerNode, t.identifier("Provider"));
  }

  _serializeReactTemporalFunc(
    {  }: OperationDescriptorData,
    [renderNode, ..._args]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.callExpression(renderNode, ((_args: any): Array<any>));
  }

  _serializeCallAbstractFunc({  }: OperationDescriptorData, nodes: Array<BabelNodeExpression>): BabelNodeExpression {
    let fun_args = ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
    return t.callExpression(nodes[0], fun_args);
  }

  _serializeCallAbstractFuncThis(
    {  }: OperationDescriptorData,
    nodes: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    let fun_args = ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
    return t.callExpression(t.memberExpression(nodes[0], t.identifier("call")), fun_args);
  }

  _serializeDirectCallWithArgList(
    {  }: OperationDescriptorData,
    nodes: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    let fun_args = nodes.slice(1);
    return t.callExpression(nodes[0], ((fun_args: any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeObjectProtoHasOwnProperty(
    {  }: OperationDescriptorData,
    [methodNode, objectNode, nameNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.callExpression(t.memberExpression(methodNode, t.identifier("call")), [objectNode, nameNode]);
  }

  _serializeRebuiltObject(
    {  }: OperationDescriptorData,
    [node, propName]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.isValidIdentifier(propString)
      ? t.memberExpression(node, t.identifier(propString), false)
      : t.memberExpression(node, propName, true);
  }

  _serializeGlobalDelete({  }: OperationDescriptorData, [propName]: Array<BabelNodeExpression>): BabelNodeStatement {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.expressionStatement(t.unaryExpression("delete", this.preludeGenerator.globalReference(propString, false)));
  }

  _serializeDefineProperty(
    { object, descriptor }: OperationDescriptorData,
    [propName]: Array<BabelNodeExpression>,
    context?: SerializationContext
  ): BabelNodeStatement {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    invariant(object !== undefined);
    invariant(descriptor !== undefined);
    invariant(context !== undefined);
    return context.emitDefinePropertyBody(object, propString, descriptor);
  }

  _serializeFBMocksMagicGlobalFunction(
    {  }: OperationDescriptorData,
    [propName, ...args]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.callExpression(t.identifier(propString), ((args: any): Array<any>));
  }

  _serializeFBMocksBootloaderLoadModules(
    {  }: OperationDescriptorData,
    args: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.callExpression(
      t.memberExpression(t.identifier("Bootloader"), t.identifier("loadModules")),
      ((args: any): Array<any>)
    );
  }

  _serializeUnknownArrayGetPartial(
    {  }: OperationDescriptorData,
    [o, p]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return memberExpressionHelper(o, p);
  }

  _serializeObjectGetPartial({  }: OperationDescriptorData, [o, p]: Array<BabelNodeExpression>): BabelNodeExpression {
    return memberExpressionHelper(o, p);
  }

  _serializeAbstractObjectGetPartial(
    {  }: OperationDescriptorData,
    [o, p]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return memberExpressionHelper(o, p);
  }

  _serializeObjectSetPartial(
    {  }: OperationDescriptorData,
    [objectNode, keyNode, valueNode]: Array<BabelNodeExpression>
  ): BabelNodeStatement {
    return t.expressionStatement(t.assignmentExpression("=", memberExpressionHelper(objectNode, keyNode), valueNode));
  }

  _serializeIdentifier({ id }: OperationDescriptorData, nodes: Array<BabelNodeExpression>): BabelNodeExpression {
    invariant(id !== undefined);
    return t.identifier(id);
  }

  _serializeCoerceToString({  }: OperationDescriptorData, [p]: Array<BabelNodeExpression>): BabelNodeExpression {
    return t.binaryExpression("+", t.stringLiteral(""), p);
  }

  _serializeBabelHelpersObjectWithoutProperties(
    {  }: OperationDescriptorData,
    [methodNode, objNode, propRemoveNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.callExpression(methodNode, [objNode, propRemoveNode]);
  }

  _serializeReactDefaultPropsHelper(
    {  }: OperationDescriptorData,
    [methodNode, ..._args]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.callExpression(methodNode, ((_args: any): Array<any>));
  }

  _serializeUnknownArrayMethodCall(
    {  }: OperationDescriptorData,
    [methodNode, ..._args]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.callExpression(methodNode, ((_args: any): Array<any>));
  }

  _serializeUnknownArrayLength({  }: OperationDescriptorData, [o]: Array<BabelNodeExpression>): BabelNodeExpression {
    return t.memberExpression(o, t.identifier("length"), false);
  }

  _serializeUnknownArrayMethodPropertyCall(
    {  }: OperationDescriptorData,
    [objNode, propName, ..._args]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.callExpression(t.memberExpression(objNode, t.identifier(propString)), ((_args: any): Array<any>));
  }

  _serializeThrow({  }: OperationDescriptorData, [argument]: Array<BabelNodeExpression>): BabelNodeStatement {
    return t.throwStatement(argument);
  }

  _serializeConditionalThrow(
    { value }: OperationDescriptorData,
    nodes: Array<BabelNodeExpression>,
    context?: SerializationContext
  ): BabelNodeStatement {
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

  _serializeReactSSRTemplateLiteral(
    { quasis }: OperationDescriptorData,
    valueNodes: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    invariant(quasis !== undefined);
    return t.templateLiteral(quasis, valueNodes);
  }

  _serializeReactRenderValueHelper(
    {  }: OperationDescriptorData,
    [helperNode, valueNode]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.callExpression(helperNode, [valueNode]);
  }

  _serializePropertyDelete(
    {  }: OperationDescriptorData,
    [objectNode, propName]: Array<BabelNodeExpression>
  ): BabelNodeStatement {
    return t.expressionStatement(t.unaryExpression("delete", memberExpressionHelper(objectNode, propName)));
  }

  _serializeGetBinding(
    { binding }: OperationDescriptorData,
    nodes: Array<BabelNodeExpression>,
    context?: SerializationContext
  ): BabelNodeExpression {
    invariant(binding !== undefined);
    invariant(context !== undefined);
    return context.serializeBinding(binding);
  }

  _serializeForFunctionCall(
    { usesThis }: OperationDescriptorData,
    [func, thisExpr]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return usesThis
      ? t.callExpression(t.memberExpression(func, t.identifier("call")), [thisExpr])
      : t.callExpression(func, []);
  }

  _serializeNewExpression(
    {  }: OperationDescriptorData,
    [constructorNode, ...argListNodes]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.newExpression(constructorNode, argListNodes);
  }

  _serializeEmitCall(
    { callFunctionRef }: OperationDescriptorData,
    nodes: Array<BabelNodeExpression>
  ): BabelNodeStatement {
    invariant(callFunctionRef !== undefined);
    let callFunction = this.preludeGenerator.memoizeReference(callFunctionRef);
    return t.expressionStatement(t.callExpression(callFunction, [...nodes]));
  }

  _serializeEmitCallAndCaptureResults(
    { callFunctionRef }: OperationDescriptorData,
    nodes: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    invariant(callFunctionRef !== undefined);
    let callFunction = this.preludeGenerator.memoizeReference(callFunctionRef);
    return t.callExpression(callFunction, ((nodes: any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeObjectProtoGetOwnPropertyDescriptor(
    {  }: OperationDescriptorData,
    [funcNode, ...args]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.callExpression(funcNode, ((args: any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
  }

  _serializeCallBailout(
    { propRef, thisArg }: OperationDescriptorData,
    nodes: Array<BabelNodeExpression>
  ): BabelNodeExpression {
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
  ): BabelNodeStatement {
    invariant(context !== undefined);
    invariant(value instanceof Value);
    return context.getPropertyAssignmentStatement(
      memberExpressionHelper(objectNode, propName),
      value,
      value.mightHaveBeenDeleted(),
      /* deleteIfMightHaveBeenDeleted */ true
    );
  }

  _serializeGlobalAssignment(
    {  }: OperationDescriptorData,
    [valueNode, propName]: Array<BabelNodeExpression>
  ): BabelNodeStatement {
    let propString = ((propName: any): BabelNodeStringLiteral).value;
    return t.expressionStatement(
      t.assignmentExpression("=", this.preludeGenerator.globalReference(propString, false), valueNode)
    );
  }

  _serializeSingleArg({  }: OperationDescriptorData, [o]: Array<BabelNodeExpression>): BabelNodeExpression {
    return o;
  }

  _serializeAbstractProperty(
    {  }: OperationDescriptorData,
    [o, propName]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return memberExpressionHelper(o, propName);
  }

  _serializeUnaryExpression(
    { unaryOperator, prefix }: OperationDescriptorData,
    [x, y]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    invariant(unaryOperator !== undefined);
    return t.unaryExpression(unaryOperator, x, prefix);
  }

  _serializeBinaryExpression(
    { binaryOperator }: OperationDescriptorData,
    [x, y]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    invariant(binaryOperator !== undefined);
    return t.binaryExpression(binaryOperator, x, y);
  }

  _serializeLogicalExpression(
    { logicalOperator }: OperationDescriptorData,
    [x, y]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    invariant(logicalOperator !== undefined);
    return t.logicalExpression(logicalOperator, x, y);
  }

  _serializeConditionalExpression(
    {  }: OperationDescriptorData,
    [c, x, y]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.conditionalExpression(c, x, y);
  }

  _serializeDerivedOperationDescriptor(id: string, babelNode: BabelNodeExpression): BabelNodeStatement {
    return t.variableDeclaration("var", [t.variableDeclarator(t.identifier(id), babelNode)]);
  }

  _serializeVoidOperationDescriptor(babelNode: BabelNodeExpression): BabelNodeStatement {
    return t.expressionStatement(babelNode);
  }

  _serializeAbstractFromTemplate(
    { templateSource }: OperationDescriptorData,
    nodes: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    let templateArguments = {};
    let i = 0;
    for (let node of nodes) templateArguments[Placeholders[i++]] = node;
    invariant(templateSource !== undefined);
    return this.preludeGenerator.buildExpression(templateSource, templateArguments);
  }

  _serializeObjectAssign(
    {  }: OperationDescriptorData,
    [targetNode, ...sourceNodes]: Array<BabelNodeExpression>
  ): BabelNodeExpression {
    return t.callExpression(this.preludeGenerator.memoizeReference("Object.assign"), [targetNode, ...sourceNodes]);
  }
}
