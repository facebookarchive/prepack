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
import type { BaseValue, Binding, ReferenceName } from "../environment.js";
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
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";
import {
  AbruptCompletion,
  ForkedAbruptCompletion,
  ThrowCompletion,
  ReturnCompletion,
  PossiblyNormalCompletion,
  SimpleNormalCompletion,
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
} from "@babel/types";
import { memberExpressionHelper } from "./babelhelpers.js";
import { concretize } from "../singletons.js";
import type { SerializerOptions } from "../options.js";
import * as t from "@babel/types";

export type ResidualBuildNodeType =
  | "IDENTIFIER"
  | "SINGLE_ARG"
  | "REBUILT_OBJECT"
  | "CONSOLE_LOG"
  | "FOR_IN"
  | "DO_WHILE"
  | "CONCRETE_MODEL"
  | "BINARY_EXPRESSION"
  | "LOGICAL_EXPRESSION"
  | "CONDITIONAL_EXPRESSION"
  | "UNARY_EXPRESSION"
  | "ABSTRACT_FROM_TEMPLATE"
  | "GLOBAL_ASSIGNMENT"
  | "GLOBAL_DELETE"
  | "EMIT_PROPERTY_ASSIGNMENT"
  | "ABSTRACT_PROPERTY"
  | "JOIN_GENERATORS"
  | "APPEND_GENERATOR"
  | "DEFINE_PROPERTY"
  | "PROPERTY_DELETE"
  | "THROW"
  | "CONDITIONAL_THROW"
  | "COERCE_TO_STRING"
  | "ABSTRACT_FROM_TEMPLATE"
  | "FOR_STATEMENT_FUNC"
  | "NEW_EXPRESSION"
  | "OBJECT_ASSIGN"
  | "OBJECT_SET_PARTIAL"
  | "OBJECT_GET_PARTIAL"
  | "OBJECT_PROTO_HAS_OWN_PROPERTY"
  | "OBJECT_PROTO_GET_OWN_PROPERTY_DESCRIPTOR"
  | "ABSTRACT_OBJECT_SET_PARTIAL"
  | "ABSTRACT_OBJECT_SET_PARTIAL_VALUE"
  | "ABSTRACT_OBJECT_GET_PARTIAL"
  | "ABSTRACT_OBJECT_GET_PROTO_OF"
  | "DIRECT_CALL_WITH_ARG_LIST"
  | "CALL_ABSTRACT_FUNC"
  | "CALL_ABSTRACT_FUNC_THIS"
  | "CALL_BAILOUT"
  | "EMIT_CALL"
  | "EMIT_CALL_AND_CAPTURE_RESULT"
  | "GET_BINDING"
  | "LOCAL_ASSIGNMENT"
  | "LOGICAL_PROPERTY_ASSIGNMENT"
  | "CONDITIONAL_PROPERTY_ASSIGNMENT"
  | "PROPERTY_ASSIGNMENT"
  | "MODULES_REQUIRE"
  | "RESIDUAL_CALL"
  | "ASSUME_CALL"
  | "CANNOT_BECOME_OBJECT"
  | "UPDATE_INCREMENTOR"
  | "WIDENED_IDENTIFIER"
  | "WIDEN_PROPERTY"
  | "WIDEN_ABSTRACT_PROPERTY"
  | "WIDEN_PROPERTY_ASSIGNMENT"
  | "WIDEN_ABSTRACT_PROPERTY_ASSIGNMENT"
  | "INVARIANT"
  | "INVARIANT_APPEND"
  | "DERIVED_ABSTRACT_INVARIANT"
  | "PROPERTY_INVARIANT"
  | "FULL_INVARIANT"
  | "FULL_INVARIANT_FUNCTION"
  | "FULL_INVARIANT_ABSTRACT"
  | "UNKNOWN_ARRAY_METHOD_CALL"
  | "UNKNOWN_ARRAY_METHOD_PROPERTY_CALL"
  | "UNKNOWN_ARRAY_LENGTH"
  | "UNKNOWN_ARRAY_GET_PARTIAL"
  | "BABEL_HELPERS_OBJECT_WITHOUT_PROPERTIES"
  | "REACT_DEFAULT_PROPS_HELPER"
  | "REACT_TEMPORAL_FUNC"
  | "REACT_CREATE_CONTEXT_PROVIDER"
  | "REACT_SSR_REGEX_CONSTANT"
  | "REACT_SSR_PREV_TEXT_NODE"
  | "REACT_SSR_RENDER_VALUE_HELPER"
  | "REACT_SSR_TEMPLATE_LITERAL"
  | "REACT_NATIVE_STRING_LITERAL"
  | "REACT_RELAY_MOCK_CONTAINER"
  | "FB_MOCKS_BOOTLOADER_LOAD_MODULES"
  | "FB_MOCKS_MAGIC_GLOBAL_FUNCTION";

export type DerivedExpressionBuildNodeFunction = (
  Array<BabelNodeExpression>,
  SerializationContext,
  Set<AbstractValue | ObjectValue>
) => BabelNodeExpression;

export type ResidualBuildNode = {
  data: ResidualBuildNodeData,
  kind: void | ResidualBuildKind,
  type: ResidualBuildNodeType,
};

export type ResidualBuildNodeData = {
  appendLastToInvariantBuildNode?: ResidualBuildNode,
  binding?: Binding | PropertyBinding,
  boundName?: BabelNodeIdentifier,
  callTemplate?: () => BabelNodeExpression,
  concreteComparisons?: Array<Value>,
  desc?: Descriptor,
  generator?: Generator,
  generators?: Array<Generator>,
  id?: string,
  lh?: BabelNodeVariableDeclaration,
  op?: any, // TODO: This is a union of Babel operators, refactor to not use "any" at some point
  prefix?: boolean,
  path?: Value,
  propName?: string,
  propRef?: ReferenceName | AbstractValue,
  object?: ObjectValue,
  quasis?: Array<any>,
  state?: "MISSING" | "PRESENT" | "DEFINED",
  thisArg?: BaseValue | Value,
  template?: PreludeGenerator => ({}) => BabelNodeExpression,
  typeComparisons?: Set<typeof Value>,
  typeofString?: string,
  usesThis?: boolean,
  value?: Value,
  violationConditionBuildNode?: ResidualBuildNode,
};

export type ResidualBuildKind = "DERIVED" | "VOID";

export function createResidualBuildNode(
  type: ResidualBuildNodeType,
  data?: ResidualBuildNodeData = {},
  kind?: ResidualBuildKind
): ResidualBuildNode {
  return {
    data,
    kind,
    type,
  };
}

export type SerializationContext = {|
  serializeBuildNode: (
    ResidualBuildNode,
    Array<BabelNodeExpression>,
    SerializationContext,
    Set<AbstractValue | ObjectValue>
  ) => BabelNodeStatement,
  serializeValue: Value => BabelNodeExpression,
  serializeBinding: Binding => BabelNodeIdentifier | BabelNodeMemberExpression,
  getPropertyAssignmentStatement: (
    location: BabelNodeLVal,
    value: Value,
    mightHaveBeenDeleted: boolean,
    deleteIfMightHaveBeenDeleted: boolean
  ) => BabelNodeStatement,
  serializeGenerator: (Generator, Set<AbstractValue | ObjectValue>) => Array<BabelNodeStatement>,
  initGenerator: Generator => void,
  finalizeGenerator: Generator => void,
  emitDefinePropertyBody: (ObjectValue, string | SymbolValue, Descriptor) => BabelNodeStatement,
  emit: BabelNodeStatement => void,
  processValues: (Set<AbstractValue | ObjectValue>) => void,
  canOmit: Value => boolean,
  declare: (AbstractValue | ObjectValue) => void,
  emitPropertyModification: PropertyBinding => void,
  options: SerializerOptions,
|};

export type VisitEntryCallbacks = {|
  visitEquivalentValue: Value => Value,
  visitGenerator: (Generator, Generator) => void,
  canOmit: Value => boolean,
  recordDeclaration: (AbstractValue | ObjectValue) => void,
  recordDelayedEntry: (Generator, GeneratorEntry) => void,
  visitModifiedObjectProperty: PropertyBinding => void,
  visitModifiedBinding: Binding => [ResidualFunctionBinding, Value],
  visitBindingAssignment: (Binding, Value) => Value,
|};

export class GeneratorEntry {
  constructor(realm: Realm) {
    // We increment the index of every TemporalBuildNodeEntry created.
    // This should match up as a form of timeline value due to the tree-like
    // structure we use to create entries during evaluation. For example,
    // if all AST nodes in a BlockStatement resulted in a temporal build node
    // for each AST node, then each would have a sequential index as to its
    // position of how it was evaluated in the BlockSstatement.
    this.index = realm.temporalEntryCounter++;
  }

  visit(callbacks: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(false, "GeneratorEntry is an abstract base class");
  }

  serialize(context: SerializationContext) {
    invariant(false, "GeneratorEntry is an abstract base class");
  }

  getDependencies(): void | Array<Generator> {
    invariant(false, "GeneratorEntry is an abstract base class");
  }

  notEqualToAndDoesNotHappenBefore(entry: GeneratorEntry): boolean {
    return this.index > entry.index;
  }

  notEqualToAndDoesNotHappenAfter(entry: GeneratorEntry): boolean {
    return this.index < entry.index;
  }

  index: number;
}

export type TemporalBuildNodeEntryArgs = {
  declared?: AbstractValue | ObjectValue,
  args: Array<Value>,
  // If we're just trying to add roots for the serializer to notice, we don't need a buildNode.
  buildNode?: ResidualBuildNode,
  dependencies?: Array<Generator>,
  isPure?: boolean,
  mutatesOnly?: Array<Value>,
};

export class TemporalBuildNodeEntry extends GeneratorEntry {
  constructor(realm: Realm, args: TemporalBuildNodeEntryArgs) {
    super(realm);
    Object.assign(this, args);
    if (this.mutatesOnly !== undefined) {
      invariant(!this.isPure);
      for (let arg of this.mutatesOnly) {
        invariant(this.args.includes(arg));
      }
    }
  }

  declared: void | AbstractValue | ObjectValue;
  args: Array<Value>;
  // If we're just trying to add roots for the serializer to notice, we don't need a buildNode.
  buildNode: void | ResidualBuildNode;
  dependencies: void | Array<Generator>;
  isPure: void | boolean;
  mutatesOnly: void | Array<Value>;

  visit(callbacks: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    let omit = this.isPure && this.declared && callbacks.canOmit(this.declared);

    if (!omit && this.declared && this.mutatesOnly !== undefined) {
      omit = true;
      for (let arg of this.mutatesOnly) {
        if (!callbacks.canOmit(arg)) {
          omit = false;
        }
      }
    }
    if (omit) {
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

  serialize(context: SerializationContext): void {
    let omit = this.isPure && this.declared && context.canOmit(this.declared);

    if (!omit && this.declared && this.mutatesOnly !== undefined) {
      omit = true;
      for (let arg of this.mutatesOnly) {
        if (!context.canOmit(arg)) {
          omit = false;
        }
      }
    }
    if (!omit) {
      let nodes = this.args.map((boundArg, i) => context.serializeValue(boundArg));
      if (this.buildNode !== undefined) {
        let valuesToProcess = new Set();
        let node = context.serializeBuildNode(this.buildNode, nodes, context, valuesToProcess);
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

  getDependencies(): void | Array<Generator> {
    return this.dependencies;
  }
}

export class TemporalObjectAssignEntry extends TemporalBuildNodeEntry {
  visit(callbacks: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    let declared = this.declared;
    if (!(declared instanceof AbstractObjectValue || declared instanceof ObjectValue)) {
      return false;
    }
    let realm = declared.$Realm;
    // The only optimization we attempt to do to Object.assign for now is merging of multiple entries
    // into a new generator entry.
    let result = attemptToMergeEquivalentObjectAssigns(realm, callbacks, this);

    if (result instanceof TemporalObjectAssignEntry) {
      let nextResult = result;
      while (nextResult instanceof TemporalObjectAssignEntry) {
        nextResult = attemptToMergeEquivalentObjectAssigns(realm, callbacks, result);
        // If we get back a TemporalObjectAssignEntry, then we have successfully merged a single
        // Object.assign, but we may be able to merge more. So repeat the process.
        if (nextResult instanceof TemporalObjectAssignEntry) {
          result = nextResult;
        }
      }
      // We have an optimized temporal entry, so replace the current temporal
      // entry and visit that entry instead.
      this.args = result.args;
    } else if (result === "POSSIBLE_OPTIMIZATION") {
      callbacks.recordDelayedEntry(containingGenerator, this);
      return false;
    }
    return super.visit(callbacks, containingGenerator);
  }
}

type ModifiedPropertyEntryArgs = {|
  propertyBinding: PropertyBinding,
  newDescriptor: void | Descriptor,
  containingGenerator: Generator,
|};

class ModifiedPropertyEntry extends GeneratorEntry {
  constructor(realm: Realm, args: ModifiedPropertyEntryArgs) {
    super(realm);
    Object.assign(this, args);
  }

  containingGenerator: Generator;
  propertyBinding: PropertyBinding;
  newDescriptor: void | Descriptor;

  serialize(context: SerializationContext): void {
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

  getDependencies(): void | Array<Generator> {
    return undefined;
  }
}

type ModifiedBindingEntryArgs = {|
  modifiedBinding: Binding,
  newValue: void | Value,
  containingGenerator: Generator,
|};

class ModifiedBindingEntry extends GeneratorEntry {
  constructor(realm: Realm, args: ModifiedBindingEntryArgs) {
    super(realm);
    Object.assign(this, args);
  }

  containingGenerator: Generator;
  modifiedBinding: Binding;
  newValue: void | Value;
  residualFunctionBinding: void | ResidualFunctionBinding;

  serialize(context: SerializationContext): void {
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
    invariant(
      this.modifiedBinding.value === this.newValue,
      "ModifiedBinding's value has been changed since last visit."
    );
    let [residualBinding, newValue] = context.visitModifiedBinding(this.modifiedBinding);
    invariant(
      this.residualFunctionBinding === undefined || this.residualFunctionBinding === residualBinding,
      "ResidualFunctionBinding has been changed since last visit."
    );
    this.residualFunctionBinding = residualBinding;
    this.newValue = newValue;
    return true;
  }

  getDependencies(): void | Array<Generator> {
    return undefined;
  }
}

class ReturnValueEntry extends GeneratorEntry {
  constructor(realm: Realm, generator: Generator, returnValue: Value) {
    super(realm);
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

  serialize(context: SerializationContext): void {
    let result = context.serializeValue(this.returnValue);
    context.emit(t.returnStatement(result));
  }

  getDependencies(): void | Array<Generator> {
    return undefined;
  }
}

class IfThenElseEntry extends GeneratorEntry {
  constructor(generator: Generator, completion: PossiblyNormalCompletion | ForkedAbruptCompletion, realm: Realm) {
    super(realm);
    this.completion = completion;
    this.containingGenerator = generator;
    this.condition = completion.joinCondition;

    this.consequentGenerator = Generator.fromEffects(completion.consequentEffects, realm, "ConsequentEffects");
    this.alternateGenerator = Generator.fromEffects(completion.alternateEffects, realm, "AlternateEffects");
  }

  completion: PossiblyNormalCompletion | ForkedAbruptCompletion;
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

  serialize(context: SerializationContext): void {
    let condition = context.serializeValue(this.condition);
    let valuesToProcess = new Set();
    let consequentBody = context.serializeGenerator(this.consequentGenerator, valuesToProcess);
    let alternateBody = context.serializeGenerator(this.alternateGenerator, valuesToProcess);
    context.emit(t.ifStatement(condition, t.blockStatement(consequentBody), t.blockStatement(alternateBody)));
    context.processValues(valuesToProcess);
  }

  getDependencies(): void | Array<Generator> {
    return [this.consequentGenerator, this.alternateGenerator];
  }
}

class BindingAssignmentEntry extends GeneratorEntry {
  constructor(realm: Realm, binding: Binding, value: Value) {
    super(realm);
    this.binding = binding;
    this.value = value;
  }

  binding: Binding;
  value: Value;

  serialize(context: SerializationContext): void {
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

  getDependencies(): void | Array<Generator> {
    return undefined;
  }
}

export class Generator {
  constructor(realm: Realm, name: string, pathConditions: Array<AbstractValue>, effects?: Effects) {
    invariant(realm.useAbstractInterpretation);
    let realmPreludeGenerator = realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;
    this.realm = realm;
    this._entries = [];
    this.id = realm.nextGeneratorId++;
    this._name = name;
    this.effectsToApply = effects;
    this.pathConditions = pathConditions;
  }

  realm: Realm;
  _entries: Array<GeneratorEntry>;
  preludeGenerator: PreludeGenerator;
  effectsToApply: void | Effects;
  id: number;
  _name: string;
  pathConditions: Array<AbstractValue>;

  static _generatorOfEffects(
    realm: Realm,
    name: string,
    environmentRecordIdAfterGlobalCode: number,
    effects: Effects
  ): Generator {
    let { result, generator, modifiedBindings, modifiedProperties, createdObjects } = effects;

    let output = new Generator(realm, name, generator.pathConditions, effects);
    output.appendGenerator(generator, generator._name);

    for (let propertyBinding of modifiedProperties.keys()) {
      let object = propertyBinding.object;
      if (createdObjects.has(object)) continue; // Created Object's binding
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
    if (result instanceof SimpleNormalCompletion || result instanceof ReturnCompletion) {
      output.emitReturnValue(result.value);
    } else if (result instanceof PossiblyNormalCompletion || result instanceof ForkedAbruptCompletion) {
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

  emitPropertyModification(propertyBinding: PropertyBinding): void {
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
      new ModifiedPropertyEntry(this.realm, {
        propertyBinding,
        newDescriptor: desc,
        containingGenerator: this,
      })
    );
  }

  emitBindingModification(modifiedBinding: Binding): void {
    invariant(this.effectsToApply !== undefined);
    this._entries.push(
      new ModifiedBindingEntry(this.realm, {
        modifiedBinding,
        newValue: modifiedBinding.value,
        containingGenerator: this,
      })
    );
  }

  emitReturnValue(result: Value): void {
    this._entries.push(new ReturnValueEntry(this.realm, this, result));
  }

  emitIfThenElse(result: PossiblyNormalCompletion | ForkedAbruptCompletion, realm: Realm): void {
    this._entries.push(new IfThenElseEntry(this, result, realm));
  }

  getName(): string {
    return `${this._name}(#${this.id})`;
  }

  empty(): boolean {
    return this._entries.length === 0;
  }

  emitGlobalDeclaration(key: string, value: Value): void {
    this.preludeGenerator.declaredGlobals.add(key);
    if (!(value instanceof UndefinedValue)) this.emitGlobalAssignment(key, value);
  }

  emitGlobalAssignment(key: string, value: Value): void {
    this._addEntry({
      args: [value],
      buildNode: createResidualBuildNode("GLOBAL_ASSIGNMENT", { propName: key }),
    });
  }

  emitConcreteModel(key: string, value: Value): void {
    this._addEntry({
      args: [concretize(this.realm, value)],
      buildNode: createResidualBuildNode("CONCRETE_MODEL", { propName: key }),
    });
  }

  emitGlobalDelete(key: string): void {
    this._addEntry({
      args: [],
      buildNode: createResidualBuildNode("GLOBAL_DELETE", { propName: key }),
    });
  }

  emitBindingAssignment(binding: Binding, value: Value): void {
    this._entries.push(new BindingAssignmentEntry(this.realm, binding, value));
  }

  emitPropertyAssignment(object: ObjectValue, key: string, value: Value): void {
    if (object.refuseSerialization) return;
    this._addEntry({
      args: [object, value],
      buildNode: createResidualBuildNode("EMIT_PROPERTY_ASSIGNMENT", { propName: key, value }),
    });
  }

  emitDefineProperty(object: ObjectValue, key: string, desc: Descriptor, isDescChanged: boolean = true): void {
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
        buildNode: createResidualBuildNode("DEFINE_PROPERTY", { object, propName: key, desc }),
      });
    }
  }

  emitPropertyDelete(object: ObjectValue, key: string): void {
    if (object.refuseSerialization) return;
    this._addEntry({
      args: [object],
      buildNode: createResidualBuildNode("PROPERTY_DELETE", { propName: key }),
    });
  }

  emitCall(callTemplate: () => BabelNodeExpression, args: Array<Value>): void {
    this._addEntry({
      args,
      buildNode: createResidualBuildNode("EMIT_CALL", { callTemplate }),
    });
  }

  emitConsoleLog(method: ConsoleMethodTypes, args: Array<string | ConcreteValue>): void {
    this._addEntry({
      args: args.map(v => (typeof v === "string" ? new StringValue(this.realm, v) : v)),
      buildNode: createResidualBuildNode("CONSOLE_LOG", { propName: method }),
    });
  }

  // test must be a temporal value, which means that it must have a defined intrinsicName
  emitDoWhileStatement(test: AbstractValue, body: Generator): void {
    this._addEntry({
      args: [],
      buildNode: createResidualBuildNode("DO_WHILE", { generator: body, value: test }),
      dependencies: [body],
    });
  }

  emitConditionalThrow(value: Value): void {
    this._addEntry({
      args: [value],
      buildNode: createResidualBuildNode("CONDITIONAL_THROW", { value }),
    });
  }

  _issueThrowCompilerDiagnostic(value: Value): void {
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

  emitThrow(value: Value): void {
    this._issueThrowCompilerDiagnostic(value);
    this.emitStatement([value], createResidualBuildNode("THROW"));
  }

  // Checks the full set of possible concrete values as well as typeof
  // for any AbstractValues
  // e.g: (obj.property !== undefined && typeof obj.property !== "object")
  // NB: if the type of the AbstractValue is top, skips the invariant
  emitFullInvariant(object: ObjectValue | AbstractObjectValue, key: string, value: Value): void {
    if (object.refuseSerialization) return;
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
        } else if (absValue.getType() === Value) {
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
        this._emitInvariant(
          [value, value],
          createResidualBuildNode("FULL_INVARIANT_ABSTRACT", { concreteComparisons, typeComparisons }),
          createResidualBuildNode("INVARIANT_APPEND", { propName: key })
        );
      }
    } else if (value instanceof FunctionValue) {
      // We do a special case for functions,
      // as we like to use concrete functions in the model to model abstract behaviors.
      // These concrete functions do not have the right identity.
      this._emitInvariant(
        [object, value, object],
        createResidualBuildNode("FULL_INVARIANT_FUNCTION", { propName: key }),
        createResidualBuildNode("INVARIANT_APPEND", { propName: key })
      );
    } else {
      this._emitInvariant(
        [object, value, object],
        createResidualBuildNode("FULL_INVARIANT", { propName: key }),
        createResidualBuildNode("INVARIANT_APPEND", { propName: key })
      );
    }
  }

  emitPropertyInvariant(
    object: ObjectValue | AbstractObjectValue,
    key: string,
    state: "MISSING" | "PRESENT" | "DEFINED"
  ): void {
    if (object.refuseSerialization) return;
    this._emitInvariant(
      [object, object],
      createResidualBuildNode("PROPERTY_INVARIANT", { state, propName: key }),
      createResidualBuildNode("INVARIANT_APPEND", { propName: key })
    );
  }

  _emitInvariant(
    args: Array<Value>,
    violationConditionBuildNode: ResidualBuildNode,
    appendLastToInvariantBuildNode: ResidualBuildNode
  ): void {
    invariant(this.realm.invariantLevel > 0);
    let invariantBuildNode = createResidualBuildNode("INVARIANT", {
      appendLastToInvariantBuildNode,
      violationConditionBuildNode,
    });
    this._addEntry({
      args,
      buildNode: invariantBuildNode,
    });
  }

  emitCallAndCaptureResult(
    types: TypesDomain,
    values: ValuesDomain,
    callTemplate: () => BabelNodeExpression,
    args: Array<Value>,
    kind?: AbstractValueKind
  ): AbstractValue {
    return this.deriveAbstract(
      types,
      values,
      args,
      createResidualBuildNode("EMIT_CALL_AND_CAPTURE_RESULT", { callTemplate }),
      { kind }
    );
  }

  emitStatement(args: Array<Value>, buildNode: ResidualBuildNode): void {
    invariant(typeof buildNode !== "function");
    this._addEntry({
      args,
      buildNode,
    });
  }

  emitVoidExpression(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    buildNode: ResidualBuildNode
  ): UndefinedValue {
    let voidBuildNode = createResidualBuildNode(buildNode.type, buildNode.data, "VOID");
    this._addEntry({
      args,
      buildNode: voidBuildNode,
    });
    return this.realm.intrinsics.undefined;
  }

  emitForInStatement(
    o: ObjectValue | AbstractObjectValue,
    lh: BabelNodeVariableDeclaration,
    sourceObject: ObjectValue,
    targetObject: ObjectValue,
    boundName: BabelNodeIdentifier
  ): void {
    this._addEntry({
      // duplicate args to ensure refcount > 1
      args: [o, targetObject, sourceObject, targetObject, sourceObject],
      buildNode: createResidualBuildNode("FOR_IN", { boundName, lh }),
    });
  }

  deriveConcreteObject(
    buildValue: (intrinsicName: string) => ObjectValue,
    args: Array<Value>,
    buildNode: ResidualBuildNode,
    optionalArgs?: {| isPure?: boolean |}
  ): ConcreteValue {
    let id = this.preludeGenerator.nameGenerator.generate("derived");
    let value = buildValue(id);
    value.intrinsicNameGenerated = true;
    value._isScopedTemplate = true; // because this object doesn't exist ahead of time, and the visitor would otherwise declare it in the common scope
    // Build nodes are immutable so we need create a new version to update properties
    let derivedBuildNode = createResidualBuildNode(
      buildNode.type,
      Object.assign({}, buildNode.data, { id }),
      "DERIVED"
    );
    this._addDerivedEntry(id, {
      isPure: optionalArgs ? optionalArgs.isPure : undefined,
      declared: value,
      args,
      buildNode: derivedBuildNode,
    });
    return value;
  }

  deriveAbstract(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    buildNode: ResidualBuildNode,
    optionalArgs?: {|
      kind?: AbstractValueKind,
      isPure?: boolean,
      skipInvariant?: boolean,
      mutatesOnly?: Array<Value>,
    |}
  ): AbstractValue {
    let id = this.preludeGenerator.nameGenerator.generate("derived");
    let options = {};
    if (optionalArgs && optionalArgs.kind) options.kind = optionalArgs.kind;
    let Constructor = Value.isTypeCompatibleWith(types.getType(), ObjectValue) ? AbstractObjectValue : AbstractValue;
    let res = new Constructor(
      this.realm,
      types,
      values,
      1735003607742176 + this.realm.derivedIds.size,
      [],
      createResidualBuildNode("IDENTIFIER", { id }),
      options
    );
    // Build nodes are immutable so we need create a new version to update properties
    let derivedBuildNode = createResidualBuildNode(
      buildNode.type,
      Object.assign({}, buildNode.data, { id }),
      "DERIVED"
    );
    this._addDerivedEntry(id, {
      isPure: optionalArgs ? optionalArgs.isPure : undefined,
      declared: res,
      args,
      buildNode: derivedBuildNode,
      mutatesOnly: optionalArgs ? optionalArgs.mutatesOnly : undefined,
    });
    let type = types.getType();
    res.intrinsicName = id;
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
        createResidualBuildNode("DERIVED_ABSTRACT_INVARIANT", { typeofString }),
        createResidualBuildNode("SINGLE_ARG")
      );
    }

    return res;
  }

  visit(callbacks: VisitEntryCallbacks): void {
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

  serialize(context: SerializationContext): void {
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

  _addEntry(entryArgs: TemporalBuildNodeEntryArgs): TemporalBuildNodeEntry {
    let entry;
    let buildNode = entryArgs.buildNode;
    if (buildNode && buildNode.type === "OBJECT_ASSIGN") {
      entry = new TemporalObjectAssignEntry(this.realm, entryArgs);
    } else {
      entry = new TemporalBuildNodeEntry(this.realm, entryArgs);
    }
    this.realm.saveTemporalGeneratorEntryArgs(entry);
    this._entries.push(entry);
    return entry;
  }

  _addDerivedEntry(id: string, entryArgs: TemporalBuildNodeEntryArgs): void {
    let entry = this._addEntry(entryArgs);
    this.realm.derivedIds.set(id, entry);
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
        buildNode: createResidualBuildNode("APPEND_GENERATOR", { generator: other, propName: leadingComment }),
      });
    }
  }

  joinGenerators(joinCondition: AbstractValue, generator1: Generator, generator2: Generator): void {
    invariant(generator1 !== this && generator2 !== this && generator1 !== generator2);
    if (generator1.empty() && generator2.empty()) return;
    let generators = [generator1, generator2];
    this._addEntry({
      args: [joinCondition],
      buildNode: createResidualBuildNode("JOIN_GENERATORS", { generators }),
      dependencies: generators,
    });
  }
}

function escapeInvalidIdentifierCharacters(s: string): string {
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
    this.memoizedRefs = new Map();
    this.nameGenerator = new NameGenerator(new Set(), !!debugNames, uniqueSuffix || "", "_$");
    this.usesThis = false;
    this.declaredGlobals = new Set();
    this.nextInvariantId = 0;
  }

  prelude: Array<BabelNodeStatement>;
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

  globalReference(key: string, globalScope: boolean = false): BabelNodeIdentifier | BabelNodeMemberExpression {
    if (globalScope && t.isValidIdentifier(key)) return t.identifier(key);
    return memberExpressionHelper(this.memoizeReference("global"), key);
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

type TemporalBuildNodeEntryOptimizationStatus = "NO_OPTIMIZATION" | "POSSIBLE_OPTIMIZATION";

// This function attempts to optimize Object.assign calls, by merging mulitple
// calls into one another where possible. For example:
//
// var a = Object.assign({}, someAbstact);
// var b = Object.assign({}, a);
//
// Becomes:
// var b = Object.assign({}, someAbstract, a);
//
export function attemptToMergeEquivalentObjectAssigns(
  realm: Realm,
  callbacks: VisitEntryCallbacks,
  temporalBuildNodeEntry: TemporalBuildNodeEntry
): TemporalBuildNodeEntryOptimizationStatus | TemporalObjectAssignEntry {
  let args = temporalBuildNodeEntry.args;
  // If we are Object.assigning 2 or more args
  if (args.length < 2) {
    return "NO_OPTIMIZATION";
  }
  let to = args[0];
  // Then scan through the args after the "to" of this Object.assign, to see if any
  // other sources are the "to" of a previous Object.assign call
  loopThroughArgs: for (let i = 1; i < args.length; i++) {
    let possibleOtherObjectAssignTo = args[i];
    // Ensure that the "to" value can be omitted
    // Note: this check is still somewhat fragile and depends on the visiting order
    // but it's not a functional problem right now and can be better addressed at a
    // later point.
    if (!callbacks.canOmit(possibleOtherObjectAssignTo)) {
      continue;
    }
    // Check if the "to" was definitely an Object.assign, it should
    // be a snapshot AbstractObjectValue
    if (possibleOtherObjectAssignTo instanceof AbstractObjectValue) {
      let otherTemporalBuildNodeEntry = realm.getTemporalBuildNodeEntryFromDerivedValue(possibleOtherObjectAssignTo);
      if (!(otherTemporalBuildNodeEntry instanceof TemporalObjectAssignEntry)) {
        continue;
      }
      let otherArgs = otherTemporalBuildNodeEntry.args;
      // Object.assign has at least 1 arg
      if (otherArgs.length < 2) {
        continue;
      }
      let otherArgsToUse = [];
      for (let x = 1; x < otherArgs.length; x++) {
        let arg = otherArgs[x];
        // The arg might have been havoced, so ensure we do not continue in this case
        if (arg instanceof ObjectValue && arg.mightBeHavocedObject()) {
          continue loopThroughArgs;
        }
        if (arg instanceof ObjectValue || arg instanceof AbstractValue) {
          let temporalGeneratorEntries = realm.getTemporalGeneratorEntriesReferencingArg(arg);
          // We need to now check if there are any other temporal entries that exist
          // between the Object.assign TemporalObjectAssignEntry that we're trying to
          // merge and the current TemporalObjectAssignEntry we're going to merge into.
          if (temporalGeneratorEntries !== undefined) {
            for (let temporalGeneratorEntry of temporalGeneratorEntries) {
              // If the entry is that of another Object.assign, then
              // we know that this entry isn't going to cause issues
              // with merging the TemporalObjectAssignEntry.
              if (temporalGeneratorEntry instanceof TemporalObjectAssignEntry) {
                continue;
              }
              // TODO: what if the temporalGeneratorEntry can be omitted and not needed?

              // If the index of this entry exists between start and end indexes,
              // then we cannot optimize and merge the TemporalObjectAssignEntry
              // because another generator entry may have a dependency on the Object.assign
              // TemporalObjectAssignEntry we're trying to merge.
              if (
                temporalGeneratorEntry.notEqualToAndDoesNotHappenBefore(otherTemporalBuildNodeEntry) &&
                temporalGeneratorEntry.notEqualToAndDoesNotHappenAfter(temporalBuildNodeEntry)
              ) {
                continue loopThroughArgs;
              }
            }
          }
        }
        otherArgsToUse.push(arg);
      }
      // If we cannot omit the "to" value that means it's being used, so we shall not try to
      // optimize this Object.assign.
      if (!callbacks.canOmit(to)) {
        let newArgs = [to, ...otherArgsToUse];

        for (let x = 2; x < args.length; x++) {
          let arg = args[x];
          // We don't want to add the "to" that we're merging with!
          if (arg !== possibleOtherObjectAssignTo) {
            newArgs.push(arg);
          }
        }
        // We now create a new TemporalObjectAssignEntry, without mutating the existing
        // entry at this point. This new entry is essentially a TemporalObjectAssignEntry
        // that contains two Object.assign call TemporalObjectAssignEntry entries that have
        // been merged into a single entry. The previous Object.assign TemporalObjectAssignEntry
        // should dead-code eliminate away once we replace the original TemporalObjectAssignEntry
        // we started with with the new merged on as they will no longer be referenced.
        let newTemporalObjectAssignEntryArgs = Object.assign({}, temporalBuildNodeEntry, {
          args: newArgs,
        });
        return new TemporalObjectAssignEntry(realm, newTemporalObjectAssignEntryArgs);
      }
      // We might be able to optimize, but we are not sure because "to" can still omit.
      // So we return possible optimization status and wait until "to" does get visited.
      // It may never get visited, but that's okay as we'll skip the optimization all
      // together.
      return "POSSIBLE_OPTIMIZATION";
    }
  }
  return "NO_OPTIMIZATION";
}
