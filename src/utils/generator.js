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
import type {
  ConsoleMethodTypes,
  Descriptor,
  DisplayResult,
  PropertyBinding,
  SupportedGraphQLGetters,
} from "../types.js";
import type { BaseValue, Binding, ReferenceName } from "../environment.js";
import {
  AbstractObjectValue,
  AbstractValue,
  type AbstractValueKind,
  BooleanValue,
  ConcreteValue,
  EmptyValue,
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
import { JoinedNormalAndAbruptCompletions, SimpleNormalCompletion, ThrowCompletion } from "../completions.js";
import type {
  BabelNodeExpression,
  BabelNodeIdentifier,
  BabelNodeMemberExpression,
  BabelNodeStatement,
  BabelNodeVariableDeclaration,
  BabelNodeBlockStatement,
  BabelNodeLVal,
  BabelUnaryOperator,
  BabelBinaryOperator,
  BabelLogicalOperator,
  BabelNodeTemplateElement,
} from "@babel/types";
import { concretize, Join, Utils } from "../singletons.js";
import type { SerializerOptions } from "../options.js";
import type { PathConditions, ShapeInformationInterface } from "../types.js";
import { PreludeGenerator } from "./PreludeGenerator.js";
import { PropertyDescriptor } from "../descriptors.js";

export type OperationDescriptorType =
  | "ABSTRACT_FROM_TEMPLATE"
  | "ABSTRACT_OBJECT_GET"
  | "ABSTRACT_OBJECT_GET_PARTIAL"
  | "ABSTRACT_OBJECT_GET_PROTO_OF"
  | "ABSTRACT_PROPERTY"
  | "ASSUME_CALL"
  | "BABEL_HELPERS_OBJECT_WITHOUT_PROPERTIES"
  | "BINARY_EXPRESSION"
  | "CALL_ABSTRACT_FUNC"
  | "CALL_ABSTRACT_FUNC_THIS"
  | "CALL_BAILOUT"
  | "CANNOT_BECOME_OBJECT"
  | "COERCE_TO_STRING"
  | "CONCRETE_MODEL"
  | "CONDITIONAL_EXPRESSION"
  | "CONDITIONAL_PROPERTY_ASSIGNMENT"
  | "CONDITIONAL_THROW"
  | "CONSOLE_LOG"
  | "DEFINE_PROPERTY"
  | "DERIVED_ABSTRACT_INVARIANT"
  | "DIRECT_CALL_WITH_ARG_LIST"
  | "DO_WHILE"
  | "EMIT_CALL"
  | "EMIT_CALL_AND_CAPTURE_RESULT"
  | "EMIT_PROPERTY_ASSIGNMENT"
  | "FB_MOCKS_BOOTLOADER_LOAD_MODULES"
  | "FB_MOCKS_MAGIC_GLOBAL_FUNCTION"
  | "FOR_IN"
  | "FOR_STATEMENT_FUNC"
  | "FULL_INVARIANT"
  | "FULL_INVARIANT_ABSTRACT"
  | "FULL_INVARIANT_FUNCTION"
  | "GET_BINDING"
  | "GLOBAL_ASSIGNMENT"
  | "GLOBAL_DELETE"
  | "IDENTIFIER"
  | "INVARIANT"
  | "INVARIANT_APPEND"
  | "JOIN_GENERATORS"
  | "LOCAL_ASSIGNMENT"
  | "LOGICAL_EXPRESSION"
  | "LOGICAL_PROPERTY_ASSIGNMENT"
  | "MODULES_REQUIRE"
  | "NEW_EXPRESSION"
  | "NOOP"
  | "OBJECT_ASSIGN"
  | "OBJECT_GET_PARTIAL"
  | "OBJECT_PROTO_GET_OWN_PROPERTY_DESCRIPTOR"
  | "OBJECT_PROTO_HAS_OWN_PROPERTY"
  | "OBJECT_SET_PARTIAL"
  | "PROPERTY_ASSIGNMENT"
  | "PROPERTY_DELETE"
  | "PROPERTY_INVARIANT"
  | "REACT_CREATE_CONTEXT_PROVIDER"
  | "REACT_DEFAULT_PROPS_HELPER"
  | "REACT_NATIVE_STRING_LITERAL"
  | "REACT_RELAY_MOCK_CONTAINER"
  | "REACT_SSR_PREV_TEXT_NODE"
  | "REACT_SSR_REGEX_CONSTANT"
  | "REACT_SSR_RENDER_VALUE_HELPER"
  | "REACT_SSR_TEMPLATE_LITERAL"
  | "REACT_TEMPORAL_FUNC"
  | "REBUILT_OBJECT"
  | "RESIDUAL_CALL"
  | "SINGLE_ARG"
  | "THROW"
  | "UNARY_EXPRESSION"
  | "UNKNOWN_ARRAY_GET_PARTIAL"
  | "UNKNOWN_ARRAY_LENGTH"
  | "UNKNOWN_ARRAY_METHOD_CALL"
  | "UNKNOWN_ARRAY_METHOD_PROPERTY_CALL"
  | "UPDATE_INCREMENTOR"
  | "WIDEN_PROPERTY"
  | "WIDEN_PROPERTY_ASSIGNMENT"
  | "WIDENED_IDENTIFIER";

export type OperationDescriptor = {
  data: OperationDescriptorData,
  type: OperationDescriptorType,
};

// TODO: gradually remove all these, currently it's a random bag of values
// that should be in args or in other places rather than here.
export type OperationDescriptorData = {
  appendLastToInvariantOperationDescriptor?: OperationDescriptor, // used by INVARIANT
  binding?: Binding, // used by GET_BINDING
  propertyBinding?: PropertyBinding, // used by LOGICAL_PROPERTY_ASSIGNMENT
  boundName?: BabelNodeIdentifier, // used by FOR_IN
  callFunctionRef?: string, // used by EMIT_CALL and EMIT_CALL_AND_CAPTURE_RESULT
  concreteComparisons?: Array<Value>, // used by FULL_INVARIANT_ABSTRACT
  descriptor?: Descriptor, // used by DEFINE_PROPERTY
  generator?: Generator, // used by DO_WHILE
  generators?: Array<Generator>, // used by JOIN_GENERATORS
  id?: string, // used by IDENTIFIER
  lh?: BabelNodeVariableDeclaration, // used by FOR_IN
  unaryOperator?: BabelUnaryOperator, // used by UNARY_EXPRESSION
  binaryOperator?: BabelBinaryOperator, // used by BINARY_EXPRESSION
  logicalOperator?: BabelLogicalOperator, // used by LOGICAL_EXPRESSION
  incrementor?: "+" | "-", // used by UPDATE_INCREMENTOR
  prefix?: boolean, // used by UNARY_EXPRESSION
  path?: Value, // used by PROPERTY_ASSIGNMENT, CONDITIONAL_PROPERTY_ASSIGNMENT
  propertyGetter?: SupportedGraphQLGetters, // used by ABSTRACT_OBJECT_GET
  propRef?: ReferenceName | AbstractValue, // used by CALL_BAILOUT, and then only if string
  object?: ObjectValue, // used by DEFINE_PROPERTY
  quasis?: Array<BabelNodeTemplateElement>, // used by REACT_SSR_TEMPLATE_LITERAL
  state?: "MISSING" | "PRESENT" | "DEFINED", // used by PROPERTY_INVARIANT
  thisArg?: BaseValue | Value, // used by CALL_BAILOUT
  templateSource?: string, // used by ABSTRACT_FROM_TEMPLATE
  typeComparisons?: Set<typeof Value>, // used by FULL_INVARIANT_ABSTRACT
  usesThis?: boolean, // used by FOR_STATEMENT_FUNC
  value?: Value, // used by DO_WHILE, CONDITIONAL_PROPERTY_ASSIGNMENT, LOGICAL_PROPERTY_ASSIGNMENT, LOCAL_ASSIGNMENT, CONDITIONAL_THROW, EMIT_PROPERTY_ASSIGNMENT
  violationConditionOperationDescriptor?: OperationDescriptor, // used by INVARIANT
};

export function createOperationDescriptor(
  type: OperationDescriptorType,
  data?: OperationDescriptorData = {}
): OperationDescriptor {
  return {
    data,
    type,
  };
}

export type SerializationContext = {|
  serializeOperationDescriptor: (
    OperationDescriptor,
    Array<BabelNodeExpression>,
    SerializationContext,
    Set<AbstractValue | ObjectValue>,
    void | string
  ) => BabelNodeStatement,
  serializeBinding: Binding => BabelNodeIdentifier | BabelNodeMemberExpression,
  serializeBindingAssignment: (Binding, Value) => BabelNodeStatement,
  serializeCondition: (Value, Generator, Generator, Set<AbstractValue | ObjectValue>) => BabelNodeStatement,
  serializeDebugScopeComment: (AbstractValue | ObjectValue) => BabelNodeStatement,
  serializeReturnValue: Value => BabelNodeStatement,
  serializeGenerator: (Generator, Set<AbstractValue | ObjectValue>) => Array<BabelNodeStatement>,
  serializeValue: Value => BabelNodeExpression,
  getPropertyAssignmentStatement: (
    location: BabelNodeLVal,
    value: Value,
    mightHaveBeenDeleted: boolean,
    deleteIfMightHaveBeenDeleted: boolean
  ) => BabelNodeStatement,
  initGenerator: Generator => void,
  finalizeGenerator: Generator => void,
  emitDefinePropertyBody: (ObjectValue, string | SymbolValue, Descriptor) => BabelNodeStatement,
  emit: BabelNodeStatement => void,
  processValues: (Set<AbstractValue | ObjectValue>) => void,
  canOmit: Value => boolean,
  declare: (AbstractValue | ObjectValue) => void,
  emitPropertyModification: PropertyBinding => void,
  emitBindingModification: Binding => void,
  options: SerializerOptions,
|};

export type VisitEntryCallbacks = {|
  visitEquivalentValue: Value => Value,
  visitGenerator: (Generator, Generator) => void,
  canOmit: Value => boolean,
  recordDeclaration: (AbstractValue | ObjectValue) => void,
  recordDelayedEntry: (Generator, GeneratorEntry) => void,
  visitModifiedProperty: PropertyBinding => void,
  visitModifiedBinding: Binding => void,
  visitBindingAssignment: (Binding, Value) => Value,
|};

export type CustomGeneratorEntryType = "MODIFIED_PROPERTY" | "MODIFIED_BINDING" | "RETURN" | "BINDING_ASSIGNMENT";

export interface Printer {
  printGeneratorEntry(
    declared: void | AbstractValue | ObjectValue,
    type: OperationDescriptorType | CustomGeneratorEntryType,
    args: Array<Value>,
    data: OperationDescriptorData,
    metadata: { isPure: boolean, mutatesOnly: void | Array<Value> }
  ): void;
  printGenerator(generator: Generator, label?: string): void;
}

export class GeneratorEntry {
  constructor(realm: Realm) {
    // We increment the index of every TemporalOperationEntry created.
    // This should match up as a form of timeline value due to the tree-like
    // structure we use to create entries during evaluation. For example,
    // if all AST nodes in a BlockStatement resulted in a temporal operation
    // for each AST node, then each would have a sequential index as to its
    // position of how it was evaluated in the BlockSstatement.
    this.index = realm.temporalEntryCounter++;
  }

  print(printer: Printer): void {
    invariant(false, "GeneratorEntry is an abstract base class");
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

export type TemporalOperationEntryArgs = {
  declared?: AbstractValue | ObjectValue,
  args: Array<Value>,
  operationDescriptor: OperationDescriptor,
  isPure?: boolean,
  mutatesOnly?: Array<Value>,
};

export class TemporalOperationEntry extends GeneratorEntry {
  constructor(realm: Realm, args: TemporalOperationEntryArgs) {
    super(realm);
    Object.assign(this, args);
    if (this.mutatesOnly !== undefined) {
      invariant(!this.isPure);
      for (let arg of this.mutatesOnly) {
        invariant(this.args.includes(arg));
      }
    }
    invariant(this.operationDescriptor !== undefined);
  }

  declared: void | AbstractValue | ObjectValue;
  args: Array<Value>;
  operationDescriptor: OperationDescriptor;
  isPure: void | boolean;
  mutatesOnly: void | Array<Value>;

  print(printer: Printer): void {
    const operationDescriptor = this.operationDescriptor;
    printer.printGeneratorEntry(this.declared, operationDescriptor.type, this.args, this.operationDescriptor.data, {
      isPure: !!this.isPure,
      mutatesOnly: this.mutatesOnly,
    });
  }

  toDisplayJson(depth: number): DisplayResult {
    if (depth <= 0) return `TemporalOperation${this.index}`;
    let obj = { type: "TemporalOperation", ...this };
    delete obj.operationDescriptor;
    return Utils.verboseToDisplayJson(obj, depth);
  }

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
      for (let i = 0, n = this.args.length; i < n; i++) {
        let originalArg = this.args[i];
        let visitedArg = callbacks.visitEquivalentValue(originalArg);
        this.args[i] = visitedArg;
        if (i === 0) {
          switch (this.operationDescriptor.type) {
            case "CALL_BAILOUT":
              if (originalArg === this.operationDescriptor.data.thisArg)
                this.operationDescriptor.data.thisArg = visitedArg;
              break;
            case "CONDITIONAL_THROW":
              this.operationDescriptor.data.value = visitedArg;
              break;
            default:
              break;
          }
        } else if (i === 1) {
          switch (this.operationDescriptor.type) {
            case "EMIT_PROPERTY_ASSIGNMENT":
            case "LOGICAL_PROPERTY_ASSIGNMENT":
              this.operationDescriptor.data.value = visitedArg;
              break;
            case "CONDITIONAL_PROPERTY_ASSIGNMENT":
              if (originalArg === this.operationDescriptor.data.value) this.operationDescriptor.data.value = visitedArg;
              break;
            case "DEFINE_PROPERTY":
              invariant(visitedArg instanceof ObjectValue);
              this.operationDescriptor.data.object = visitedArg;
              break;
            default:
              break;
          }
        }
      }
      let dependencies = this.getDependencies();
      if (dependencies !== undefined)
        for (let dependency of dependencies) callbacks.visitGenerator(dependency, containingGenerator);
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
      let valuesToProcess = new Set();
      let declaredId = this.declared !== undefined ? this.declared.intrinsicName : undefined;
      let node = context.serializeOperationDescriptor(
        this.operationDescriptor,
        nodes,
        context,
        valuesToProcess,
        declaredId
      );
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
        context.emit(context.serializeDebugScopeComment(declared));
      }
      context.emit(node);
      context.processValues(valuesToProcess);

      if (this.declared !== undefined) context.declare(this.declared);
    }
  }

  getDependencies(): void | Array<Generator> {
    const operationDescriptor = this.operationDescriptor;
    switch (operationDescriptor.type) {
      case "DO_WHILE":
        let generator = operationDescriptor.data.generator;
        invariant(generator !== undefined);
        return [generator];
      case "JOIN_GENERATORS":
        let generators = operationDescriptor.data.generators;
        invariant(generators !== undefined);
        return generators;
      default:
        return undefined;
    }
  }
}

export class TemporalObjectAssignEntry extends TemporalOperationEntry {
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

  print(printer: Printer): void {
    printer.printGeneratorEntry(
      undefined,
      "MODIFIED_PROPERTY",
      [],
      { descriptor: this.newDescriptor, propertyBinding: this.propertyBinding },
      { isPure: false, mutatesOnly: undefined }
    );
  }

  toDisplayString(): string {
    let propertyKey = this.propertyBinding.key;
    let propertyKeyString = propertyKey instanceof Value ? propertyKey.toDisplayString() : propertyKey;
    invariant(propertyKeyString !== undefined);
    return `[ModifiedProperty ${propertyKeyString}]`;
  }

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
    context.visitModifiedProperty(this.propertyBinding);
    return true;
  }

  getDependencies(): void | Array<Generator> {
    return undefined;
  }
}

type ModifiedBindingEntryArgs = {|
  modifiedBinding: Binding,
  containingGenerator: Generator,
|};

class ModifiedBindingEntry extends GeneratorEntry {
  constructor(realm: Realm, args: ModifiedBindingEntryArgs) {
    super(realm);
    Object.assign(this, args);
  }

  containingGenerator: Generator;
  modifiedBinding: Binding;

  print(printer: Printer): void {
    printer.printGeneratorEntry(
      undefined,
      "MODIFIED_BINDING",
      [],
      { binding: this.modifiedBinding, value: this.modifiedBinding.value },
      { isPure: false, mutatesOnly: undefined }
    );
  }

  toDisplayString(): string {
    return `[ModifiedBinding ${this.modifiedBinding.name}]`;
  }

  serialize(context: SerializationContext): void {
    context.emitBindingModification(this.modifiedBinding);
  }

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(
      containingGenerator === this.containingGenerator,
      "This entry requires effects to be applied and may not be moved"
    );
    context.visitModifiedBinding(this.modifiedBinding);
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

  print(printer: Printer): void {
    printer.printGeneratorEntry(undefined, "RETURN", [this.returnValue], {}, { isPure: false, mutatesOnly: undefined });
  }

  toDisplayString(): string {
    return `[Return ${this.returnValue.toDisplayString()}]`;
  }

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(
      containingGenerator === this.containingGenerator,
      "This entry requires effects to be applied and may not be moved"
    );
    this.returnValue = context.visitEquivalentValue(this.returnValue);
    return true;
  }

  serialize(context: SerializationContext): void {
    context.emit(context.serializeReturnValue(this.returnValue));
  }

  getDependencies(): void | Array<Generator> {
    return undefined;
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

  print(printer: Printer): void {
    printer.printGeneratorEntry(
      undefined,
      "BINDING_ASSIGNMENT",
      [this.value],
      { binding: this.binding },
      { isPure: false, mutatesOnly: undefined }
    );
  }

  toDisplayString(): string {
    return `[BindingAssignment ${this.binding.name} = ${this.value.toDisplayString()}]`;
  }

  serialize(context: SerializationContext): void {
    context.emit(context.serializeBindingAssignment(this.binding, this.value));
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
  constructor(realm: Realm, name: string, pathConditions: PathConditions, effects?: Effects) {
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
  pathConditions: PathConditions;

  print(printer: Printer): void {
    for (let entry of this._entries) entry.print(printer);
  }

  toDisplayString(): string {
    return Utils.jsonToDisplayString(this, 2);
  }

  toDisplayJson(depth: number): DisplayResult {
    if (depth <= 0) return `Generator${this.id}-${this._name}`;
    return Utils.verboseToDisplayJson(this, depth);
  }

  static _generatorOfEffects(
    realm: Realm,
    name: string,
    optimizedFunction: FunctionValue,
    effects: Effects
  ): Generator {
    let { result, generator, modifiedBindings, modifiedProperties, createdObjects } = effects;

    let output = new Generator(realm, name, generator.pathConditions, effects);
    output.appendGenerator(generator, generator._name);

    for (let propertyBinding of modifiedProperties.keys()) {
      let object = propertyBinding.object;
      invariant(object.isValid());
      if (createdObjects.has(object)) continue; // Created Object's binding
      if (ObjectValue.refuseSerializationOnPropertyBinding(propertyBinding)) continue; // modification to internal state
      // modifications to intrinsic objects are tracked in the generator
      if (object.isIntrinsic()) continue;
      output.emitPropertyModification(propertyBinding);
    }

    for (let [modifiedBinding, previousValue] of modifiedBindings.entries()) {
      if (Utils.isBindingMutationOutsideFunction(modifiedBinding, previousValue, optimizedFunction)) {
        if (!modifiedBinding.hasLeaked) {
          invariant(modifiedBinding.value !== undefined);
          output.emitBindingModification(modifiedBinding);
        }
      }
    }

    if (result instanceof UndefinedValue) return output;
    if (result instanceof SimpleNormalCompletion) {
      output.emitReturnValue(result.value);
    } else if (result instanceof ThrowCompletion) {
      output.emitThrow(result.value);
    } else if (result instanceof JoinedNormalAndAbruptCompletions) {
      let selector = c =>
        c instanceof ThrowCompletion && c.value !== realm.intrinsics.__bottomValue && !(c.value instanceof EmptyValue);
      output.emitConditionalThrow(Join.joinValuesOfSelectedCompletions(selector, result, true));
      output.emitReturnValue(result.value);
    } else {
      invariant(false);
    }
    return output;
  }

  // Make sure to to fixup
  // how to apply things around sets of things
  static fromEffects(effects: Effects, realm: Realm, name: string, optimizedFunction: FunctionValue): Generator {
    return realm.withEffectsAppliedInGlobalEnv(
      this._generatorOfEffects.bind(this, realm, name, optimizedFunction),
      effects
    );
  }

  emitPropertyModification(propertyBinding: PropertyBinding): void {
    invariant(this.effectsToApply !== undefined);
    let desc = propertyBinding.descriptor;
    if (desc !== undefined && desc instanceof PropertyDescriptor) {
      let value = desc.value;
      if (value instanceof AbstractValue) {
        if (value.kind === "conditional") {
          let [c, x, y] = value.args;
          if (c instanceof AbstractValue && c.kind === "template for property name condition") {
            let ydesc = new PropertyDescriptor(Object.assign({}, (desc: any), { value: y }));
            let yprop = Object.assign({}, propertyBinding, { descriptor: ydesc });
            this.emitPropertyModification(yprop);
            let xdesc = new PropertyDescriptor(Object.assign({}, (desc: any), { value: x }));
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
        containingGenerator: this,
      })
    );
  }

  emitReturnValue(result: Value): void {
    this._entries.push(new ReturnValueEntry(this.realm, this, result));
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
      args: [value, new StringValue(this.realm, key)],
      operationDescriptor: createOperationDescriptor("GLOBAL_ASSIGNMENT"),
    });
  }

  emitConcreteModel(key: string, value: Value): void {
    this._addEntry({
      args: [concretize(this.realm, value), new StringValue(this.realm, key)],
      operationDescriptor: createOperationDescriptor("CONCRETE_MODEL"),
    });
  }

  emitGlobalDelete(key: string): void {
    this._addEntry({
      args: [new StringValue(this.realm, key)],
      operationDescriptor: createOperationDescriptor("GLOBAL_DELETE"),
    });
  }

  emitBindingAssignment(binding: Binding, value: Value): void {
    this._entries.push(new BindingAssignmentEntry(this.realm, binding, value));
  }

  emitPropertyAssignment(object: Value, key: string | Value, value: Value): void {
    if (object instanceof ObjectValue && object.refuseSerialization) {
      return;
    }
    if (typeof key === "string") {
      key = new StringValue(this.realm, key);
    }
    this._addEntry({
      args: [object, value, key],
      operationDescriptor: createOperationDescriptor("EMIT_PROPERTY_ASSIGNMENT", { value }),
    });
  }

  emitDefineProperty(object: ObjectValue, key: string, desc: PropertyDescriptor, isDescChanged: boolean = true): void {
    if (object.refuseSerialization) return;
    if (desc.enumerable && desc.configurable && desc.writable && desc.value && !isDescChanged) {
      let descValue = desc.value;
      invariant(descValue instanceof Value);
      this.emitPropertyAssignment(object, key, descValue);
    } else {
      desc = new PropertyDescriptor(desc);
      let descValue = desc.value || object.$Realm.intrinsics.undefined;
      invariant(descValue instanceof Value);
      this._addEntry({
        args: [
          new StringValue(this.realm, key),
          object,
          descValue,
          desc.get || object.$Realm.intrinsics.undefined,
          desc.set || object.$Realm.intrinsics.undefined,
        ],
        operationDescriptor: createOperationDescriptor("DEFINE_PROPERTY", { object, descriptor: desc }),
      });
    }
  }

  emitPropertyDelete(object: ObjectValue, key: string): void {
    if (object.refuseSerialization) return;
    this._addEntry({
      args: [object, new StringValue(this.realm, key)],
      operationDescriptor: createOperationDescriptor("PROPERTY_DELETE"),
    });
  }

  emitCall(callFunctionRef: string, args: Array<Value>): void {
    this._addEntry({
      args,
      operationDescriptor: createOperationDescriptor("EMIT_CALL", { callFunctionRef }),
    });
  }

  emitConsoleLog(method: ConsoleMethodTypes, args: Array<string | ConcreteValue>): void {
    this._addEntry({
      args: [
        new StringValue(this.realm, method),
        ...args.map(v => (typeof v === "string" ? new StringValue(this.realm, v) : v)),
      ],
      operationDescriptor: createOperationDescriptor("CONSOLE_LOG"),
    });
  }

  // test must be a temporal value, which means that it must have a defined intrinsicName
  emitDoWhileStatement(test: AbstractValue, body: Generator): void {
    this._addEntry({
      args: [],
      operationDescriptor: createOperationDescriptor("DO_WHILE", { generator: body, value: test }),
    });
  }

  emitConditionalThrow(value: Value): void {
    if (value instanceof EmptyValue) return;
    this._issueThrowCompilerDiagnostic(value);
    this._addEntry({
      args: [value],
      operationDescriptor: createOperationDescriptor("CONDITIONAL_THROW", { value }),
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
    this.emitStatement([value], createOperationDescriptor("THROW"));
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
          [new StringValue(this.realm, key), value, value],
          createOperationDescriptor("FULL_INVARIANT_ABSTRACT", { concreteComparisons, typeComparisons }),
          createOperationDescriptor("INVARIANT_APPEND")
        );
      }
    } else if (value instanceof FunctionValue) {
      // We do a special case for functions,
      // as we like to use concrete functions in the model to model abstract behaviors.
      // These concrete functions do not have the right identity.
      this._emitInvariant(
        [new StringValue(this.realm, key), object, value, object],
        createOperationDescriptor("FULL_INVARIANT_FUNCTION"),
        createOperationDescriptor("INVARIANT_APPEND")
      );
    } else {
      this._emitInvariant(
        [new StringValue(this.realm, key), object, value, object],
        createOperationDescriptor("FULL_INVARIANT"),
        createOperationDescriptor("INVARIANT_APPEND")
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
      [new StringValue(this.realm, key), object, object],
      createOperationDescriptor("PROPERTY_INVARIANT", { state }),
      createOperationDescriptor("INVARIANT_APPEND")
    );
  }

  _emitInvariant(
    args: Array<Value>,
    violationConditionOperationDescriptor: OperationDescriptor,
    appendLastToInvariantOperationDescriptor: OperationDescriptor
  ): void {
    invariant(this.realm.invariantLevel > 0);
    let invariantOperationDescriptor = createOperationDescriptor("INVARIANT", {
      appendLastToInvariantOperationDescriptor,
      violationConditionOperationDescriptor,
    });
    this._addEntry({
      args,
      operationDescriptor: invariantOperationDescriptor,
    });
  }

  emitCallAndCaptureResult(
    types: TypesDomain,
    values: ValuesDomain,
    callFunctionRef: string,
    args: Array<Value>,
    kind?: AbstractValueKind
  ): AbstractValue {
    return this.deriveAbstract(
      types,
      values,
      args,
      createOperationDescriptor("EMIT_CALL_AND_CAPTURE_RESULT", { callFunctionRef }),
      { kind }
    );
  }

  emitStatement(args: Array<Value>, operationDescriptor: OperationDescriptor): void {
    invariant(typeof operationDescriptor !== "function");
    this._addEntry({
      args,
      operationDescriptor,
    });
  }

  emitVoidExpression(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    operationDescriptor: OperationDescriptor
  ): UndefinedValue {
    this._addEntry({
      args,
      operationDescriptor,
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
      operationDescriptor: createOperationDescriptor("FOR_IN", { boundName, lh }),
    });
  }

  deriveConcreteObject(
    buildValue: (intrinsicName: string) => ObjectValue,
    args: Array<Value>,
    operationDescriptor: OperationDescriptor,
    optionalArgs?: {| isPure?: boolean |}
  ): ConcreteValue {
    let id = this.preludeGenerator.nameGenerator.generate("derived");
    let value = buildValue(id);
    value.intrinsicNameGenerated = true;
    value.isScopedTemplate = true; // because this object doesn't exist ahead of time, and the visitor would otherwise declare it in the common scope
    invariant(value.intrinsicName === id);
    this._addDerivedEntry({
      isPure: optionalArgs ? optionalArgs.isPure : undefined,
      declared: value,
      args,
      operationDescriptor,
    });
    return value;
  }

  deriveAbstract(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    operationDescriptor: OperationDescriptor,
    optionalArgs?: {|
      kind?: AbstractValueKind,
      isPure?: boolean,
      skipInvariant?: boolean,
      mutatesOnly?: Array<Value>,
      shape?: void | ShapeInformationInterface,
    |}
  ): AbstractValue {
    let id = this.preludeGenerator.nameGenerator.generate("derived");
    let options = {};
    if (optionalArgs && optionalArgs.kind !== undefined) options.kind = optionalArgs.kind;
    if (optionalArgs && optionalArgs.shape !== undefined) options.shape = optionalArgs.shape;
    let Constructor = Value.isTypeCompatibleWith(types.getType(), ObjectValue) ? AbstractObjectValue : AbstractValue;
    let res = new Constructor(
      this.realm,
      types,
      values,
      1735003607742176 + this.realm.derivedIds.size,
      [],
      createOperationDescriptor("IDENTIFIER", { id }),
      options
    );
    res.intrinsicName = id;
    this._addDerivedEntry({
      isPure: optionalArgs ? optionalArgs.isPure : undefined,
      declared: res,
      args,
      operationDescriptor,
      mutatesOnly: optionalArgs ? optionalArgs.mutatesOnly : undefined,
    });
    let type = types.getType();
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
        [new StringValue(this.realm, typeofString), res, res],
        createOperationDescriptor("DERIVED_ABSTRACT_INVARIANT"),
        createOperationDescriptor("SINGLE_ARG")
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

  _addEntry(entryArgs: TemporalOperationEntryArgs): TemporalOperationEntry {
    let entry;
    let operationDescriptor = entryArgs.operationDescriptor;
    if (operationDescriptor && operationDescriptor.type === "OBJECT_ASSIGN") {
      entry = new TemporalObjectAssignEntry(this.realm, entryArgs);
    } else {
      entry = new TemporalOperationEntry(this.realm, entryArgs);
    }
    this.realm.saveTemporalGeneratorEntryArgs(entry);
    this._entries.push(entry);
    return entry;
  }

  _addDerivedEntry(entryArgs: TemporalOperationEntryArgs): void {
    let declared = entryArgs.declared;
    invariant(declared !== undefined);
    let id = declared.intrinsicName;
    invariant(id !== undefined);
    let entry = this._addEntry(entryArgs);
    this.realm.derivedIds.set(id, entry);
  }

  appendGenerator(other: Generator, leadingComment: string): void {
    invariant(other !== this);
    invariant(other.realm === this.realm);
    invariant(other.preludeGenerator === this.preludeGenerator);
    invariant(other.effectsToApply === undefined);

    if (other.empty()) return;
    let otherEntries = other._entries;
    otherEntries.forEach(otherEntry => this._appendEntry(otherEntry));
  }

  _appendEntry(entry: GeneratorEntry): void {
    let attemptToMergeEntry = (): boolean => {
      // It attempts to merge the `entry` argument with the last entry item
      // in `this._entries` if both are `JOIN_GENERATORS` and have the same
      // path conditions
      if (entry instanceof TemporalOperationEntry) {
        let operationDescriptor = entry.operationDescriptor;
        if (operationDescriptor.type === "JOIN_GENERATORS" && !this.empty()) {
          invariant(operationDescriptor.data.generators);
          let thisLastEntry = this._entries[this._entries.length - 1];
          if (thisLastEntry instanceof TemporalOperationEntry) {
            let thisLastEntryOperationDescriptor = thisLastEntry.operationDescriptor;
            if (thisLastEntryOperationDescriptor.type === "JOIN_GENERATORS") {
              invariant(thisLastEntryOperationDescriptor.data.generators);
              let [entryGenerator1, entryGenerator2] = operationDescriptor.data.generators;
              let [thisLastEntryGenerator1, thisLastEntryGenerator2] = thisLastEntryOperationDescriptor.data.generators;
              if (
                entryGenerator1.pathConditions.equals(thisLastEntryGenerator1.pathConditions) &&
                entryGenerator2.pathConditions.equals(thisLastEntryGenerator2.pathConditions)
              ) {
                if (!entryGenerator1.empty())
                  entryGenerator1._entries.forEach(e => thisLastEntryGenerator1._entries.push(e));
                if (!entryGenerator2.empty())
                  entryGenerator2._entries.forEach(e => thisLastEntryGenerator2._entries.push(e));
                return true;
              }
            }
          }
        }
      }
      return false;
    };

    attemptToMergeEntry() || this._entries.push(entry);
  }

  joinGenerators(joinCondition: AbstractValue, generator1: Generator, generator2: Generator): void {
    invariant(generator1 !== this && generator2 !== this && generator1 !== generator2);
    if (generator1.empty() && generator2.empty()) return;
    let generators = [generator1, generator2];
    this._addEntry({
      args: [joinCondition],
      operationDescriptor: createOperationDescriptor("JOIN_GENERATORS", { generators }),
    });
  }
}

type TemporalOperationEntryOptimizationStatus = "NO_OPTIMIZATION" | "POSSIBLE_OPTIMIZATION";

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
  temporalOperationEntry: TemporalOperationEntry
): TemporalOperationEntryOptimizationStatus | TemporalObjectAssignEntry {
  let args = temporalOperationEntry.args;
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
      let otherTemporalOperationEntry = realm.getTemporalOperationEntryFromDerivedValue(possibleOtherObjectAssignTo);
      if (!(otherTemporalOperationEntry instanceof TemporalObjectAssignEntry)) {
        continue;
      }
      let otherArgs = otherTemporalOperationEntry.args;
      // Object.assign has at least 1 arg
      if (otherArgs.length < 1) {
        continue;
      }
      let otherArgsToUse = [];
      for (let x = 1; x < otherArgs.length; x++) {
        let arg = otherArgs[x];
        // The arg might have been leaked, so ensure we do not continue in this case
        if (arg instanceof ObjectValue && arg.mightBeLeakedObject()) {
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
                temporalGeneratorEntry.notEqualToAndDoesNotHappenBefore(otherTemporalOperationEntry) &&
                temporalGeneratorEntry.notEqualToAndDoesNotHappenAfter(temporalOperationEntry)
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
        // our merged Object.assign, shoud look like:
        // Object.assign(to, ...prefixArgs, ...otherArgsToUse, ...suffixArgs)
        let prefixArgs = args.slice(1, i - 1); // We start at 1, as 0 is the index of "to" a
        let suffixArgs = args.slice(i + 1);
        let newArgs = [to, ...prefixArgs, ...otherArgsToUse, ...suffixArgs];

        // We now create a new TemporalObjectAssignEntry, without mutating the existing
        // entry at this point. This new entry is essentially a TemporalObjectAssignEntry
        // that contains two Object.assign call TemporalObjectAssignEntry entries that have
        // been merged into a single entry. The previous Object.assign TemporalObjectAssignEntry
        // should dead-code eliminate away once we replace the original TemporalObjectAssignEntry
        // we started with with the new merged on as they will no longer be referenced.
        let newTemporalObjectAssignEntryArgs = Object.assign({}, temporalOperationEntry, {
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
