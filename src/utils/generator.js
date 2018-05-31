/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Effects, Realm } from "../realm.js";
import type { ConsoleMethodTypes, Descriptor, PropertyBinding } from "../types.js";
import type { ResidualFunctionBinding } from "../serializer/types.js";
import type { Binding } from "../environment.js";
import {
  AbstractObjectValue,
  AbstractValue,
  type AbstractValueKind,
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
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import * as t from "babel-types";
import invariant from "../invariant.js";
import {
  Completion,
  AbruptCompletion,
  JoinedAbruptCompletions,
  ThrowCompletion,
  ReturnCompletion,
  PossiblyNormalCompletion,
} from "../completions.js";
import type {
  BabelNodeExpression,
  BabelNodeIdentifier,
  BabelNodeThisExpression,
  BabelNodeStatement,
  BabelNodeMemberExpression,
  BabelNodeVariableDeclaration,
  BabelNodeBlockStatement,
  BabelNodeLVal,
} from "babel-types";
import { nullExpression } from "./internalizer.js";
import { Utils, concretize } from "../singletons.js";
import type { SerializerOptions } from "../options.js";

export type SerializationContext = {|
  serializeValue: Value => BabelNodeExpression,
  serializeBinding: Binding => BabelNodeIdentifier | BabelNodeMemberExpression,
  serializeGenerator: (Generator, Set<AbstractValue | ConcreteValue>) => Array<BabelNodeStatement>,
  initGenerator: Generator => void,
  finalizeGenerator: Generator => void,
  emitDefinePropertyBody: (ObjectValue, string | SymbolValue, Descriptor) => BabelNodeStatement,
  emit: BabelNodeStatement => void,
  processValues: (Set<AbstractValue | ConcreteValue>) => void,
  canOmit: (AbstractValue | ConcreteValue) => boolean,
  declare: (AbstractValue | ConcreteValue) => void,
  emitPropertyModification: PropertyBinding => void,
  options: SerializerOptions,
|};

export type VisitEntryCallbacks = {|
  visitEquivalentValue: Value => Value,
  visitGenerator: (Generator, Generator) => void,
  canSkip: (AbstractValue | ConcreteValue) => boolean,
  recordDeclaration: (AbstractValue | ConcreteValue) => void,
  recordDelayedEntry: (Generator, GeneratorEntry) => void,
  visitModifiedObjectProperty: PropertyBinding => void,
  visitModifiedBinding: Binding => [ResidualFunctionBinding, Value],
  visitBindingAssignment: (Binding, Value) => Value,
|};

export type DerivedExpressionBuildNodeFunction = (
  Array<BabelNodeExpression>,
  SerializationContext,
  Set<AbstractValue | ConcreteValue>
) => BabelNodeExpression;

export type GeneratorBuildNodeFunction = (
  Array<BabelNodeExpression>,
  SerializationContext,
  Set<AbstractValue | ConcreteValue>
) => BabelNodeStatement;

export class GeneratorEntry {
  visit(callbacks: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(false, "GeneratorEntry is an abstract base class");
  }

  serialize(context: SerializationContext) {
    invariant(false, "GeneratorEntry is an abstract base class");
  }

  getDependencies(): void | Array<Generator> {
    invariant(false, "GeneratorEntry is an abstract base class");
  }
}

type TemporalBuildNodeEntryArgs = {
  declared?: AbstractValue | ConcreteValue,
  args: Array<Value>,
  // If we're just trying to add roots for the serializer to notice, we don't need a buildNode.
  buildNode?: GeneratorBuildNodeFunction,
  dependencies?: Array<Generator>,
  isPure?: boolean,
};

class TemporalBuildNodeEntry extends GeneratorEntry {
  constructor(args: TemporalBuildNodeEntryArgs) {
    super();
    Object.assign(this, args);
  }

  declared: void | AbstractValue | ConcreteValue;
  args: Array<Value>;
  // If we're just trying to add roots for the serializer to notice, we don't need a buildNode.
  buildNode: void | GeneratorBuildNodeFunction;
  dependencies: void | Array<Generator>;
  isPure: void | boolean;

  visit(callbacks: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    if (this.isPure && this.declared && callbacks.canSkip(this.declared)) {
      callbacks.recordDelayedEntry(containingGenerator, this);
      return false;
    } else {
      if (this.declared) callbacks.recordDeclaration(this.declared);
      for (let i = 0, n = this.args.length; i < n; i++) this.args[i] = callbacks.visitEquivalentValue(this.args[i]);
      if (this.dependencies)
        for (let dependency of this.dependencies) callbacks.visitGenerator(dependency, containingGenerator);
      return true;
    }
  }

  serialize(context: SerializationContext) {
    if (!this.isPure || !this.declared || !context.canOmit(this.declared)) {
      let nodes = this.args.map((boundArg, i) => context.serializeValue(boundArg));
      if (this.buildNode) {
        let valuesToProcess = new Set();
        let node = this.buildNode(nodes, context, valuesToProcess);
        if (node.type === "BlockStatement") {
          let block: BabelNodeBlockStatement = (node: any);
          let statements = block.body;
          if (statements.length === 0) return;
          if (statements.length === 1) {
            node = statements[0];
          }
        }
        let declared = this.declared;
        if (declared !== undefined && context.options.debugScopes) {
          let s = t.emptyStatement();
          s.leadingComments = [({ type: "BlockComment", value: `declaring ${declared.intrinsicName || "?"}` }: any)];
          context.emit(s);
        }
        context.emit(node);
        context.processValues(valuesToProcess);
      }
      if (this.declared !== undefined) context.declare(this.declared);
    }
  }

  getDependencies() {
    return this.dependencies;
  }
}

type ModifiedPropertyEntryArgs = {|
  propertyBinding: PropertyBinding,
  newDescriptor: void | Descriptor,
  containingGenerator: Generator,
|};

class ModifiedPropertyEntry extends GeneratorEntry {
  constructor(args: ModifiedPropertyEntryArgs) {
    super();
    Object.assign(this, args);
  }

  containingGenerator: Generator;
  propertyBinding: PropertyBinding;
  newDescriptor: void | Descriptor;

  serialize(context: SerializationContext) {
    let desc = this.propertyBinding.descriptor;
    invariant(desc === this.newDescriptor);
    context.emitPropertyModification(this.propertyBinding);
  }

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(
      containingGenerator === this.containingGenerator,
      "This entry requires effects to be applied and may not be moved"
    );
    let desc = this.propertyBinding.descriptor;
    invariant(desc === this.newDescriptor);
    context.visitModifiedObjectProperty(this.propertyBinding);
    return true;
  }

  getDependencies() {
    return undefined;
  }
}

type ModifiedBindingEntryArgs = {|
  modifiedBinding: Binding,
  newValue: void | Value,
  containingGenerator: Generator,
|};

class ModifiedBindingEntry extends GeneratorEntry {
  constructor(args: ModifiedBindingEntryArgs) {
    super();
    Object.assign(this, args);
  }

  containingGenerator: Generator;
  modifiedBinding: Binding;
  newValue: void | Value;
  residualFunctionBinding: void | ResidualFunctionBinding;

  serialize(context: SerializationContext) {
    let residualFunctionBinding = this.residualFunctionBinding;
    invariant(residualFunctionBinding !== undefined);
    invariant(residualFunctionBinding.referentialized);
    invariant(
      residualFunctionBinding.serializedValue,
      "ResidualFunctionBinding must be referentialized before serializing a mutation to it."
    );
    let newValue = this.newValue;
    invariant(newValue);
    let bindingReference = ((residualFunctionBinding.serializedValue: any): BabelNodeLVal);
    invariant(
      t.isLVal(bindingReference),
      "Referentialized values must be LVals even though serializedValues may be any Expression"
    );
    let serializedNewValue = context.serializeValue(newValue);
    context.emit(t.expressionStatement(t.assignmentExpression("=", bindingReference, serializedNewValue)));
  }

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(
      containingGenerator === this.containingGenerator,
      "This entry requires effects to be applied and may not be moved"
    );
    invariant(this.modifiedBinding.value === this.newValue);
    let [residualBinding, newValue] = context.visitModifiedBinding(this.modifiedBinding);
    invariant(this.residualFunctionBinding === undefined || this.residualFunctionBinding === residualBinding);
    this.residualFunctionBinding = residualBinding;
    this.newValue = newValue;
    return true;
  }

  getDependencies() {
    return undefined;
  }
}

class ReturnValueEntry extends GeneratorEntry {
  constructor(generator: Generator, returnValue: Value) {
    super();
    this.returnValue = returnValue.promoteEmptyToUndefined();
    this.containingGenerator = generator;
  }

  returnValue: Value;
  containingGenerator: Generator;

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(
      containingGenerator === this.containingGenerator,
      "This entry requires effects to be applied and may not be moved"
    );
    this.returnValue = context.visitEquivalentValue(this.returnValue);
    return true;
  }

  serialize(context: SerializationContext) {
    let result = context.serializeValue(this.returnValue);
    context.emit(t.returnStatement(result));
  }

  getDependencies() {
    return undefined;
  }
}

class IfThenElseEntry extends GeneratorEntry {
  constructor(generator: Generator, completion: PossiblyNormalCompletion | JoinedAbruptCompletions, realm: Realm) {
    super();
    this.completion = completion;
    this.containingGenerator = generator;
    this.condition = completion.joinCondition;

    this.consequentGenerator = Generator.fromEffects(completion.consequentEffects, realm, "ConsequentEffects");
    this.alternateGenerator = Generator.fromEffects(completion.alternateEffects, realm, "AlternateEffects");
  }

  completion: PossiblyNormalCompletion | JoinedAbruptCompletions;
  containingGenerator: Generator;

  condition: Value;
  consequentGenerator: Generator;
  alternateGenerator: Generator;

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(
      containingGenerator === this.containingGenerator,
      "This entry requires effects to be applied and may not be moved"
    );
    this.condition = context.visitEquivalentValue(this.condition);
    context.visitGenerator(this.consequentGenerator, containingGenerator);
    context.visitGenerator(this.alternateGenerator, containingGenerator);
    return true;
  }

  serialize(context: SerializationContext) {
    let condition = context.serializeValue(this.condition);
    let valuesToProcess = new Set();
    let consequentBody = context.serializeGenerator(this.consequentGenerator, valuesToProcess);
    let alternateBody = context.serializeGenerator(this.alternateGenerator, valuesToProcess);
    context.emit(t.ifStatement(condition, t.blockStatement(consequentBody), t.blockStatement(alternateBody)));
    context.processValues(valuesToProcess);
  }

  getDependencies() {
    return [this.consequentGenerator, this.alternateGenerator];
  }
}

class BindingAssignmentEntry extends GeneratorEntry {
  constructor(binding: Binding, value: Value) {
    super();
    this.binding = binding;
    this.value = value;
  }

  binding: Binding;
  value: Value;

  serialize(context: SerializationContext) {
    context.emit(
      t.expressionStatement(
        t.assignmentExpression("=", context.serializeBinding(this.binding), context.serializeValue(this.value))
      )
    );
  }

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    this.value = context.visitBindingAssignment(this.binding, this.value);
    return true;
  }

  getDependencies() {
    return undefined;
  }
}

function serializeBody(
  generator: Generator,
  context: SerializationContext,
  valuesToProcess: Set<AbstractValue | ConcreteValue>
): BabelNodeBlockStatement {
  let statements = context.serializeGenerator(generator, valuesToProcess);
  if (statements.length === 1 && statements[0].type === "BlockStatement") return (statements[0]: any);
  return t.blockStatement(statements);
}

export class Generator {
  constructor(realm: Realm, name: string, effects?: Effects) {
    invariant(realm.useAbstractInterpretation);
    let realmPreludeGenerator = realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;
    this.realm = realm;
    this._entries = [];
    this.id = realm.nextGeneratorId++;
    this._name = name;
    this.effectsToApply = effects;
    this.pathConditions = [].concat(realm.pathConditions);
  }

  realm: Realm;
  _entries: Array<GeneratorEntry>;
  preludeGenerator: PreludeGenerator;
  effectsToApply: void | Effects;
  id: number;
  _name: string;
  pathConditions: Array<AbstractValue>;

  static _generatorOfEffects(realm: Realm, name: string, environmentRecordIdAfterGlobalCode: number, effects: Effects) {
    let { result, generator, modifiedBindings, modifiedProperties, createdObjects } = effects;

    let output = new Generator(realm, name, effects);
    output.appendGenerator(generator, generator._name);

    for (let propertyBinding of modifiedProperties.keys()) {
      let object = propertyBinding.object;
      if (object instanceof ObjectValue && createdObjects.has(object)) continue; // Created Object's binding
      if (object.refuseSerialization) continue; // modification to internal state
      // modifications to intrinsic objects are tracked in the generator
      if (object.isIntrinsic()) continue;
      output.emitPropertyModification(propertyBinding);
    }

    for (let modifiedBinding of modifiedBindings.keys()) {
      // TODO: Instead of looking at the environment ids, keep instead track of a createdEnvironmentRecords set,
      // and only consider bindings here from environment records that already existed, or even better,
      // ensure upstream that only such bindings are ever added to the modified-bindings set.
      if (modifiedBinding.environment.id >= environmentRecordIdAfterGlobalCode) continue;

      output.emitBindingModification(modifiedBinding);
    }

    if (result instanceof UndefinedValue) return output;
    if (result instanceof Value) {
      output.emitReturnValue(result);
    } else if (result instanceof ReturnCompletion) {
      output.emitReturnValue(result.value);
    } else if (result instanceof PossiblyNormalCompletion || result instanceof JoinedAbruptCompletions) {
      output.emitIfThenElse(result, realm);
    } else if (result instanceof ThrowCompletion) {
      output.emitThrow(result.value);
    } else if (result instanceof AbruptCompletion) {
      // no-op
    } else {
      invariant(false);
    }
    return output;
  }

  // Make sure to to fixup
  // how to apply things around sets of things
  static fromEffects(
    effects: Effects,
    realm: Realm,
    name: string,
    environmentRecordIdAfterGlobalCode: number = 0
  ): Generator {
    return realm.withEffectsAppliedInGlobalEnv(
      this._generatorOfEffects.bind(this, realm, name, environmentRecordIdAfterGlobalCode),
      effects
    );
  }

  emitPropertyModification(propertyBinding: PropertyBinding) {
    invariant(this.effectsToApply !== undefined);
    let desc = propertyBinding.descriptor;
    if (desc !== undefined) {
      let value = desc.value;
      if (value instanceof AbstractValue) {
        if (value.kind === "conditional") {
          let [c, x, y] = value.args;
          if (c instanceof AbstractValue && c.kind === "template for property name condition") {
            let ydesc = Object.assign({}, desc, { value: y });
            let yprop = Object.assign({}, propertyBinding, { descriptor: ydesc });
            this.emitPropertyModification(yprop);
            let xdesc = Object.assign({}, desc, { value: x });
            let key = c.args[0];
            invariant(key instanceof AbstractValue);
            let xprop = Object.assign({}, propertyBinding, { key, descriptor: xdesc });
            this.emitPropertyModification(xprop);
            return;
          }
        } else if (value.kind === "template for prototype member expression") {
          return;
        }
      }
    }
    this._entries.push(
      new ModifiedPropertyEntry({
        propertyBinding,
        newDescriptor: desc,
        containingGenerator: this,
      })
    );
  }

  emitBindingModification(modifiedBinding: Binding) {
    invariant(this.effectsToApply !== undefined);
    this._entries.push(
      new ModifiedBindingEntry({
        modifiedBinding,
        newValue: modifiedBinding.value,
        containingGenerator: this,
      })
    );
  }

  emitReturnValue(result: Value) {
    this._entries.push(new ReturnValueEntry(this, result));
  }

  emitIfThenElse(result: PossiblyNormalCompletion | JoinedAbruptCompletions, realm: Realm) {
    this._entries.push(new IfThenElseEntry(this, result, realm));
  }

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
    if (!(value instanceof UndefinedValue)) this.emitGlobalAssignment(key, value);
  }

  emitGlobalAssignment(key: string, value: Value) {
    this._addEntry({
      args: [value],
      buildNode: ([valueNode]) =>
        t.expressionStatement(
          t.assignmentExpression("=", this.preludeGenerator.globalReference(key, false), valueNode)
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

  emitGlobalDelete(key: string) {
    this._addEntry({
      args: [],
      buildNode: ([]) =>
        t.expressionStatement(t.unaryExpression("delete", this.preludeGenerator.globalReference(key, false))),
    });
  }

  emitBindingAssignment(binding: Binding, value: Value) {
    this._entries.push(new BindingAssignmentEntry(binding, value));
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

  emitConsoleLog(method: ConsoleMethodTypes, args: Array<string | ConcreteValue>) {
    this.emitCall(
      () => t.memberExpression(t.identifier("console"), t.identifier(method)),
      args.map(v => (typeof v === "string" ? new StringValue(this.realm, v) : v))
    );
  }

  // test must be a temporal value, which means that it must have a defined intrinsicName
  emitDoWhileStatement(test: AbstractValue, body: Generator) {
    this._addEntry({
      args: [],
      buildNode: function([], context, valuesToProcess) {
        let testId = test.intrinsicName;
        invariant(testId !== undefined);
        let statements = context.serializeGenerator(body, valuesToProcess);
        let block = t.blockStatement(statements);
        return t.doWhileStatement(t.identifier(testId), block);
      },
      dependencies: [body],
    });
  }

  emitConditionalThrow(condition: AbstractValue, trueBranch: Completion | Value, falseBranch: Completion | Value) {
    const branchToGenerator = (name: string, branch: Completion | Value): Generator => {
      const result = new Generator(this.realm, name);
      if (branch instanceof JoinedAbruptCompletions || branch instanceof PossiblyNormalCompletion) {
        result.emitConditionalThrow(branch.joinCondition, branch.consequent, branch.alternate);
      } else if (branch instanceof ThrowCompletion) {
        result.emitThrow(branch.value);
      } else {
        invariant(branch instanceof ReturnCompletion || branch instanceof Value);
      }
      return result;
    };

    this.joinGenerators(
      condition,
      branchToGenerator("TrueBranch", trueBranch),
      branchToGenerator("FalseBranch", falseBranch)
    );
  }

  _issueThrowCompilerDiagnostic(value: Value) {
    let message = "Program may terminate with exception";
    if (value instanceof ObjectValue) {
      let object = ((value: any): ObjectValue);
      let objectMessage = this.realm.evaluateWithUndo(() => object._SafeGetDataPropertyValue("message"));
      if (objectMessage instanceof StringValue) message += `: ${objectMessage.value}`;
      const objectStack = this.realm.evaluateWithUndo(() => object._SafeGetDataPropertyValue("stack"));
      if (objectStack instanceof StringValue)
        message += `
  ${objectStack.value}`;
    }
    const diagnostic = new CompilerDiagnostic(message, value.expressionLocation, "PP0023", "Warning");
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
    if (object.refuseSerialization) return;
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
        this._emitInvariant([value, value], condition, valueNode => valueNode);
      }
    } else if (value instanceof FunctionValue) {
      // We do a special case for functions,
      // as we like to use concrete functions in the model to model abstract behaviors.
      // These concrete functions do not have the right identity.
      condition = ([objectNode]) =>
        t.binaryExpression(
          "!==",
          t.unaryExpression("typeof", accessedPropertyOf(objectNode), true),
          t.stringLiteral("function")
        );
      this._emitInvariant([object, value, object], condition, objnode => accessedPropertyOf(objnode));
    } else {
      condition = ([objectNode, valueNode]) => t.binaryExpression("!==", accessedPropertyOf(objectNode), valueNode);
      this._emitInvariant([object, value, object], condition, objnode => accessedPropertyOf(objnode));
    }
  }

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

  emitPropertyInvariant(
    object: ObjectValue | AbstractObjectValue,
    key: string,
    state: "MISSING" | "PRESENT" | "DEFINED"
  ) {
    if (object.refuseSerialization) return;
    let propertyIdentifier = this.getAsPropertyNameExpression(key);
    let computed = !t.isIdentifier(propertyIdentifier);
    let accessedPropertyOf = (objectNode: BabelNodeExpression) =>
      t.memberExpression(objectNode, propertyIdentifier, computed);
    let condition = ([objectNode: BabelNodeExpression]) => {
      let n = t.callExpression(
        t.memberExpression(
          this.preludeGenerator.memoizeReference("Object.prototype.hasOwnProperty"),
          t.identifier("call")
        ),
        [objectNode, t.stringLiteral(key)]
      );
      if (state !== "MISSING") {
        n = t.unaryExpression("!", n, true);
        if (state === "DEFINED")
          n = t.logicalExpression(
            "||",
            n,
            t.binaryExpression("===", accessedPropertyOf(objectNode), t.valueToNode(undefined))
          );
      }
      return n;
    };

    this._emitInvariant([object, object], condition, objnode => accessedPropertyOf(objnode));
  }

  _emitInvariant(
    args: Array<Value>,
    violationConditionFn: (Array<BabelNodeExpression>) => BabelNodeExpression,
    appendLastToInvariantFn?: BabelNodeExpression => BabelNodeExpression
  ): void {
    invariant(this.realm.invariantLevel > 0);
    this._addEntry({
      args,
      buildNode: (nodes: Array<BabelNodeExpression>) => {
        let messageComponents = [
          t.stringLiteral("Prepack model invariant violation ("),
          t.numericLiteral(this.preludeGenerator.nextInvariantId++),
        ];
        if (appendLastToInvariantFn) {
          let last = nodes.pop();
          messageComponents.push(t.stringLiteral("): "));
          messageComponents.push(appendLastToInvariantFn(last));
        } else messageComponents.push(t.stringLiteral(")"));
        let throwString = messageComponents[0];
        for (let i = 1; i < messageComponents.length; i++)
          throwString = t.binaryExpression("+", throwString, messageComponents[i]);
        let condition = violationConditionFn(nodes);
        let consequent = this.getErrorStatement(throwString);
        return t.ifStatement(condition, consequent);
      },
    });
  }

  emitCallAndCaptureResult(
    types: TypesDomain,
    values: ValuesDomain,
    createCallee: () => BabelNodeExpression,
    args: Array<Value>,
    kind?: AbstractValueKind
  ): AbstractValue {
    return this.deriveAbstract(types, values, args, (nodes: any) => t.callExpression(createCallee(), nodes), { kind });
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

  deriveConcrete(
    buildValue: (intrinsicName: string) => ConcreteValue,
    args: Array<Value>,
    buildNode_: DerivedExpressionBuildNodeFunction | BabelNodeExpression,
    optionalArgs?: {| isPure?: boolean |}
  ): ConcreteValue {
    invariant(buildNode_ instanceof Function || args.length === 0);
    let id = t.identifier(this.preludeGenerator.nameGenerator.generate("derived"));
    this.preludeGenerator.derivedIds.set(id.name, args);
    let value = buildValue(id.name);
    if (value instanceof ObjectValue) {
      value.intrinsicNameGenerated = true;
      value._isScopedTemplate = true; // because this object doesn't exist ahead of time, and the visitor would otherwise declare it in the common scope
    }
    this._addEntry({
      isPure: optionalArgs ? optionalArgs.isPure : undefined,
      declared: value,
      args,
      buildNode: (nodes: Array<BabelNodeExpression>, context: SerializationContext, valuesToProcess) => {
        return t.variableDeclaration("var", [
          t.variableDeclarator(
            id,
            (buildNode_: any) instanceof Function
              ? ((buildNode_: any): DerivedExpressionBuildNodeFunction)(nodes, context, valuesToProcess)
              : ((buildNode_: any): BabelNodeExpression)
          ),
        ]);
      },
    });
    return value;
  }

  deriveAbstract(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    buildNode_: DerivedExpressionBuildNodeFunction | BabelNodeExpression,
    optionalArgs?: {| kind?: AbstractValueKind, isPure?: boolean, skipInvariant?: boolean |}
  ): AbstractValue {
    invariant(buildNode_ instanceof Function || args.length === 0);
    let id = t.identifier(this.preludeGenerator.nameGenerator.generate("derived"));
    this.preludeGenerator.derivedIds.set(id.name, args);
    let options = {};
    if (optionalArgs && optionalArgs.kind) options.kind = optionalArgs.kind;
    let Constructor = Value.isTypeCompatibleWith(types.getType(), ObjectValue) ? AbstractObjectValue : AbstractValue;
    let res = new Constructor(
      this.realm,
      types,
      values,
      1735003607742176 + this.preludeGenerator.derivedIds.size,
      [],
      id,
      options
    );
    this._addEntry({
      isPure: optionalArgs ? optionalArgs.isPure : undefined,
      declared: res,
      args,
      buildNode: (nodes: Array<BabelNodeExpression>, context: SerializationContext, valuesToProcess) => {
        return t.variableDeclaration("var", [
          t.variableDeclarator(
            id,
            (buildNode_: any) instanceof Function
              ? ((buildNode_: any): DerivedExpressionBuildNodeFunction)(nodes, context, valuesToProcess)
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
    if (typeofString !== undefined && this.realm.invariantLevel >= 1) {
      // Verify that the types are as expected, a failure of this invariant
      // should mean the model is wrong.
      this._emitInvariant(
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

  visit(callbacks: VisitEntryCallbacks) {
    let visitFn = () => {
      for (let entry of this._entries) entry.visit(callbacks, this);
      return null;
    };
    if (this.effectsToApply) {
      this.realm.withEffectsAppliedInGlobalEnv(visitFn, this.effectsToApply);
    } else {
      visitFn();
    }
  }

  serialize(context: SerializationContext) {
    let serializeFn = () => {
      context.initGenerator(this);
      for (let entry of this._entries) entry.serialize(context);
      context.finalizeGenerator(this);
      return null;
    };
    if (this.effectsToApply) {
      this.realm.withEffectsAppliedInGlobalEnv(serializeFn, this.effectsToApply);
    } else {
      serializeFn();
    }
  }

  getDependencies(): Array<Generator> {
    let res = [];
    for (let entry of this._entries) {
      let dependencies = entry.getDependencies();
      if (dependencies !== undefined) res.push(...dependencies);
    }
    return res;
  }

  // PITFALL Warning: adding a new kind of TemporalBuildNodeEntry that is not the result of a join or composition
  // will break this purgeEntriesWithGeneratorDepencies.
  _addEntry(entry: TemporalBuildNodeEntryArgs) {
    this._entries.push(new TemporalBuildNodeEntry(entry));
  }

  appendGenerator(other: Generator, leadingComment: string): void {
    invariant(other !== this);
    invariant(other.realm === this.realm);
    invariant(other.preludeGenerator === this.preludeGenerator);

    if (other.empty()) return;
    if (other.effectsToApply === undefined) {
      this._entries.push(...other._entries);
    } else {
      this._addEntry({
        args: [],
        buildNode: function(args, context, valuesToProcess) {
          let statements = context.serializeGenerator(other, valuesToProcess);
          if (statements.length === 1) {
            let statement = statements[0];
            if (leadingComment.length > 0)
              statement.leadingComments = [({ type: "BlockComment", value: leadingComment }: any)];
            return statement;
          }
          let block = t.blockStatement(statements);
          if (leadingComment.length > 0)
            block.leadingComments = [({ type: "BlockComment", value: leadingComment }: any)];
          return block;
        },
        dependencies: [other],
      });
    }
  }

  joinGenerators(joinCondition: AbstractValue, generator1: Generator, generator2: Generator): void {
    invariant(generator1 !== this && generator2 !== this && generator1 !== generator2);
    if (generator1.empty() && generator2.empty()) return;
    this._addEntry({
      args: [joinCondition],
      buildNode: function([cond], context, valuesToProcess) {
        let block1 = generator1.empty() ? null : serializeBody(generator1, context, valuesToProcess);
        let block2 = generator2.empty() ? null : serializeBody(generator2, context, valuesToProcess);
        if (block1) return t.ifStatement(cond, block1, block2);
        invariant(block2);
        return t.ifStatement(t.unaryExpression("!", cond), block2);
      },
      dependencies: [generator1, generator2],
    });
  }
}

function escapeInvalidIdentifierCharacters(s: string) {
  let res = "";
  for (let c of s)
    if ((c >= "0" && c <= "9") || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) res += c;
    else res += "_" + c.charCodeAt(0);
  return res;
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
        if (debugSuffix) id += "_" + escapeInvalidIdentifierCharacters(debugSuffix);
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
    this.nextInvariantId = 0;
  }

  prelude: Array<BabelNodeStatement>;
  derivedIds: Map<string, Array<Value>>;
  memoizedRefs: Map<string, BabelNodeIdentifier>;
  nameGenerator: NameGenerator;
  usesThis: boolean;
  declaredGlobals: Set<string>;
  nextInvariantId: number;

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
