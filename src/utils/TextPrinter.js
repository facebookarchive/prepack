/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import {
  Completion,
  SimpleNormalCompletion,
  ThrowCompletion,
  JoinedNormalAndAbruptCompletions,
} from "../completions.js";
import type { Realm, Effects } from "../realm.js";
import type { Descriptor, PropertyBinding } from "../types.js";
import { PropertyDescriptor, InternalSlotDescriptor, AbstractJoinedDescriptor } from "../descriptors.js";
import {
  EnvironmentRecord,
  type Binding,
  type LexicalEnvironment,
  DeclarativeEnvironmentRecord,
  FunctionEnvironmentRecord,
  ObjectEnvironmentRecord,
  GlobalEnvironmentRecord,
} from "../environment.js";
import {
  PrimitiveValue,
  AbstractValue,
  ObjectValue,
  FunctionValue,
  ECMAScriptSourceFunctionValue,
  NativeFunctionValue,
  BoundFunctionValue,
  SymbolValue,
  ProxyValue,
  Value,
  UndefinedValue,
} from "../values/index.js";
import invariant from "../invariant.js";
import {
  Printer,
  Generator,
  type OperationDescriptorType,
  type CustomGeneratorEntryType,
  type OperationDescriptorData,
} from "./generator.js";
import * as t from "@babel/types";

const indent = "  ";

export class TextPrinter implements Printer {
  constructor(
    printLine: string => void,
    abstractValueIds?: Map<AbstractValue, number> = new Map(),
    symbolIds?: Map<SymbolValue, number> = new Map()
  ) {
    this._printLine = printLine;
    this._abstractValueIds = abstractValueIds;
    this._symbolIds = symbolIds;
    this._indent = "";
    this._objects = new Set();
    this._propertyBindings = new Set();
    this._environmentRecords = new Set();
    this._bindings = new Set();
    this._lexicalEnvironments = new Set();
    this._symbols = new Set();
  }

  _printLine: string => void;
  _abstractValueIds: Map<AbstractValue, number>;
  _symbolIds: Map<SymbolValue, number>;
  _indent: string;
  _objects: Set<ObjectValue>;
  _propertyBindings: Set<PropertyBinding>;
  _environmentRecords: Set<EnvironmentRecord>;
  _bindings: Set<Binding>;
  _lexicalEnvironments: Set<LexicalEnvironment>;
  _symbols: Set<SymbolValue>;

  _nest(): void {
    this._indent += indent;
  }
  _unnest(): void {
    this._indent = this._indent.substring(0, this._indent.length - indent.length);
  }

  _print(text: string): void {
    this._printLine(this._indent + text);
  }

  _printDefinition(id: string, constructorName: string, args: Array<string>) {
    this._print(`* ${id} = ${constructorName}(${args.join(", ")})`);
  }

  printGeneratorEntry(
    declared: void | AbstractValue | ObjectValue,
    type: OperationDescriptorType | CustomGeneratorEntryType,
    args: Array<Value>,
    data: OperationDescriptorData,
    metadata: { isPure: boolean, mutatesOnly: void | Array<Value> }
  ): void {
    switch (type) {
      case "DO_WHILE":
        invariant(data.value !== undefined);
        this._print(`do while ${this.describeValue(data.value)}`);
        this._nest();
        const generator = data.generator;
        invariant(generator !== undefined);
        this.printGenerator(generator, "body");
        this._unnest();
        break;
      case "JOIN_GENERATORS":
        invariant(args.length === 1);
        this._print(`if ${this.describeValue(args[0])}`);
        this._nest();
        const generators = data.generators;
        invariant(generators !== undefined && generators.length === 2);
        this.printGenerator(generators[0], "then");
        this.printGenerator(generators[1], "else");
        this._unnest();
        break;
      default:
        let text;
        if (declared !== undefined) {
          invariant(declared.intrinsicName !== undefined);
          text = `${this.describeExpression(declared.intrinsicName)} := `;
        } else {
          text = "";
        }
        text += type;

        const dataTexts = [];
        if (data.unaryOperator !== undefined) dataTexts.push(`unary ${data.unaryOperator}`); // used by UNARY_EXPRESSION
        if (data.binaryOperator !== undefined) dataTexts.push(`binary ${data.binaryOperator}`); // used by BINARY_EXPRESSION
        if (data.logicalOperator !== undefined) dataTexts.push(`logical ${data.logicalOperator}`); // used by LOGICAL_EXPRESSION
        if (data.incrementor !== undefined) dataTexts.push(`incrementor ${data.incrementor}`); // used by UPDATE_INCREMENTOR
        if (data.prefix !== undefined) dataTexts.push("prefix"); // used by UNARY_EXPRESSION
        if (data.binding !== undefined) dataTexts.push(`binding ${this.describeBinding(data.binding)}`); // used by GET_BINDING
        if (data.propertyBinding !== undefined)
          dataTexts.push(`property binding ${this.describePropertyBinding(data.propertyBinding)}`); // used by LOGICAL_PROPERTY_ASSIGNMENT
        if (data.object !== undefined) dataTexts.push(`object ${this.describeValue(data.object)}`); // used by DEFINE_PROPERTY
        if (data.descriptor !== undefined) dataTexts.push(`desc ${this.describeDescriptor(data.descriptor)}`); // used by DEFINE_PROPERTY
        if (data.value !== undefined) dataTexts.push(`value ${this.describeValue(data.value)}`); // used by DO_WHILE, CONDITIONAL_PROPERTY_ASSIGNMENT, LOGICAL_PROPERTY_ASSIGNMENT, LOCAL_ASSIGNMENT, CONDITIONAL_THROW, EMIT_PROPERTY_ASSIGNMENT
        if (data.id !== undefined) dataTexts.push(`id ${this.describeExpression(data.id)}`); // used by IDENTIFIER
        if (data.thisArg !== undefined) dataTexts.push(`this arg ${this.describeBaseValue(data.thisArg)}`); // used by CALL_BAILOUT
        if (data.propRef !== undefined) dataTexts.push(`prop ref ${this.describeKey(data.propRef)}`); // used by CALL_BAILOUT, and then only if string
        if (data.state !== undefined) dataTexts.push(`state ${data.state}`); // used by PROPERTY_INVARIANT
        if (data.usesThis !== undefined) dataTexts.push(`usesThis`); // used by FOR_STATEMENT_FUNC
        if (data.path !== undefined) dataTexts.push(`path ${this.describeValue(data.path)}`); // used by PROPERTY_ASSIGNMENT, CONDITIONAL_PROPERTY_ASSIGNMENT
        if (data.callFunctionRef !== undefined)
          dataTexts.push(`call function ref ${this.describeExpression(data.callFunctionRef)}`); // used by EMIT_CALL and EMIT_CALL_AND_CAPTURE_RESULT
        if (data.templateSource !== undefined)
          dataTexts.push(`template source ${this.describeExpression(data.templateSource)}`); // used by ABSTRACT_FROM_TEMPLATE
        if (data.propertyGetter !== undefined) dataTexts.push(`property getter ${data.propertyGetter}`); // used by ABSTRACT_OBJECT_GET

        // TODO:
        // appendLastToInvariantOperationDescriptor?: OperationDescriptor, // used by INVARIANT
        // concreteComparisons?: Array<Value>, // used by FULL_INVARIANT_ABSTRACT
        // boundName?: BabelNodeIdentifier, // used by FOR_IN
        // lh?: BabelNodeVariableDeclaration, // used by FOR_IN
        // quasis?: Array<BabelNodeTemplateElement>, // used by REACT_SSR_TEMPLATE_LITERAL
        // typeComparisons?: Set<typeof Value>, // used by FULL_INVARIANT_ABSTRACT
        // violationConditionOperationDescriptor?: OperationDescriptor, // used by INVARIANT
        if (dataTexts.length > 0) text += `<${dataTexts.join("; ")}>`;

        if (args.length > 0) text += `(${this.describeValues(args)})`;

        const metadataTexts = [];
        if (metadata.isPure) metadataTexts.push("isPure");
        if (metadata.mutatesOnly !== undefined && metadata.mutatesOnly.length > 0)
          metadataTexts.push(`mutates only: [${this.describeValues(metadata.mutatesOnly)}]`);
        if (metadataTexts.length > 0) text += `[${metadataTexts.join("; ")}]`;

        this._print(text);
        break;
    }
  }

  printGenerator(generator: Generator, label?: string = "(entry point)"): void {
    this._print(`${label}: ${JSON.stringify(generator.getName())}`);
    this._nest();
    if (generator.pathConditions.getLength() > 0)
      this._print(
        `path conditions ${this.describeValues(Array.from(generator.pathConditions.getAssumedConditions()))}`
      );
    generator.print(this);
    this._unnest();
  }

  print(realm: Realm, optimizedFunctions: Map<FunctionValue, Generator>): void {
    const realmGenerator = realm.generator;
    if (realmGenerator !== undefined) this.printGenerator(realmGenerator);
    for (const [functionValue, generator] of optimizedFunctions) {
      const effectsToApply = generator.effectsToApply;
      invariant(effectsToApply !== undefined);
      this._print(`=== optimized function ${this.describeValue(functionValue)}`);
      realm.withEffectsAppliedInGlobalEnv(effects => {
        const nestedPrinter = new TextPrinter(this._printLine, this._abstractValueIds, this._symbolIds);
        nestedPrinter.printEffects(effects, generator);
        return nestedPrinter; // not needed, but withEffectsAppliedInGlobalEnv has an unmotivated invariant that the result must not be undefined
      }, effectsToApply);
    }
  }

  describeCompletion(result: Completion): string {
    const args = [];
    if (result instanceof SimpleNormalCompletion) args.push(`value ${this.describeValue(result.value)}`);
    else if (result instanceof ThrowCompletion) args.push(`value ${this.describeValue(result.value)}`);
    else {
      invariant(result instanceof JoinedNormalAndAbruptCompletions);
      args.push(`join condition ${this.describeValue(result.joinCondition)}`);
      args.push(`consequent ${this.describeCompletion(result.consequent)}`);
      args.push(`alternate ${this.describeCompletion(result.alternate)}`);
      if (result.composedWith !== undefined) args.push(`composed with ${this.describeCompletion(result.composedWith)}`);
    }
    return `${result.constructor.name}(${args.join(", ")})`;
  }

  printEffects(effects: Effects, generator?: Generator): void {
    this._nest();
    this.printGenerator(generator || effects.generator);
    // skip effects.generator
    if (effects.modifiedProperties.size > 0)
      this._print(
        `modified property bindings: [${Array.from(effects.modifiedProperties.keys())
          .map(propertyBinding => this.describePropertyBinding(propertyBinding))
          .join(", ")}]`
      );
    if (effects.modifiedBindings.size > 0)
      this._print(
        `modified bindings: [${Array.from(effects.modifiedBindings.keys())
          .map(binding => this.describeBinding(binding))
          .join(", ")}]`
      );
    if (effects.createdObjects.size > 0)
      this._print(
        `created objects: [${Array.from(effects.createdObjects)
          .map(object => this.describeValue(object))
          .join(", ")}]`
      );
    if (!(effects.result instanceof UndefinedValue)) this._print(`result: ${this.describeCompletion(effects.result)}`);
    this._unnest();
  }

  describeExpression(expression: string): string {
    if (t.isValidIdentifier(expression)) return expression;
    else return "@" + JSON.stringify(expression);
  }

  describeValues<V: Value>(values: Array<V>): string {
    return values.map(value => this.describeValue(value)).join(", ");
  }

  abstractValueName(value: AbstractValue): string {
    const id = this._abstractValueIds.get(value);
    invariant(id !== undefined);
    return `value#${id}`;
  }

  printAbstractValue(value: AbstractValue): void {
    invariant(value.intrinsicName === undefined);
    let kind = value.kind;
    // TODO: I'd expect kind to be defined in this situation; however, it's not defined for test ForInStatement4.js
    // invariant(kind !== undefined);
    if (kind === undefined) kind = "(no kind)";
    this._printDefinition(
      this.abstractValueName(value),
      this.describeExpression(kind),
      value.args.map(arg => this.describeValue(arg))
    );
  }

  objectValueName(value: ObjectValue): string {
    invariant(this._objects.has(value));
    let name;
    if (value instanceof FunctionValue) name = "func";
    else if (value instanceof ProxyValue) name = "proxy";
    else name = "object";
    return `${name}#${value.getHash()}`;
  }

  printObjectValue(value: ObjectValue): void {
    const args = [];

    if (value.temporalAlias !== undefined) args.push(`temporalAlias ${this.describeValue(value.temporalAlias)}`);

    if (value instanceof FunctionValue) {
      if (value instanceof NativeFunctionValue) {
        // TODO: This shouldn't happen; all native function values should be intrinsics
      } else if (value instanceof BoundFunctionValue) {
        args.push(`$BoundTargetFunction ${this.describeValue(value.$BoundTargetFunction)}`);
        args.push(`$BoundThis ${this.describeValue(value.$BoundThis)}`);
        args.push(`$BoundArguments [${this.describeValues(value.$BoundArguments)}]`);
      } else {
        invariant(value instanceof ECMAScriptSourceFunctionValue);
        args.push(`$ConstructorKind ${value.$ConstructorKind}`);
        args.push(`$ThisMode ${value.$ThisMode}`);
        args.push(`$FunctionKind ${value.$FunctionKind}`);
        if (value.$HomeObject !== undefined) args.push(`$HomeObject ${this.describeValue(value.$HomeObject)}`);

        // TODO: $Strict should always be defined according to its flow type signature, however, there are some tests where it's not
        if (value.$Strict) args.push(`$Strict`);
        args.push(`$FormalParameters ${value.$FormalParameters.length}`);
        // TODO: pretty-print $ECMAScriptCode

        // TODO: $Environment should always be defined according to its flow type signature, however, it's not in test ConcreteModel2.js
        if (value.$Environment) args.push(`$Environment ${this.describeLexicalEnvironment(value.$Environment)}`);
      }
    } else if (value instanceof ProxyValue) {
      args.push(`$ProxyTarget ${this.describeValue(value.$ProxyTarget)}`);
      args.push(`$ProxyHandler ${this.describeValue(value.$ProxyHandler)}`);
    } else {
      const kind = value.getKind();
      if (kind !== "Object") args.push(`kind ${kind}`);
      switch (kind) {
        case "RegExp":
          const originalSource = value.$OriginalSource;
          invariant(originalSource !== undefined);
          args.push(`$OriginalSource ${originalSource}`);
          const originalFlags = value.$OriginalFlags;
          invariant(originalFlags !== undefined);
          args.push(`$OriginalFlags ${originalFlags}`);
          break;
        case "Number":
          const numberData = value.$NumberData;
          invariant(numberData !== undefined);
          args.push(`$NumberData ${this.describeValue(numberData)}`);
          break;
        case "String":
          const stringData = value.$StringData;
          invariant(stringData !== undefined);
          args.push(`$StringData ${this.describeValue(stringData)}`);
          break;
        case "Boolean":
          const booleanData = value.$BooleanData;
          invariant(booleanData !== undefined);
          args.push(`$BooleanData ${this.describeValue(booleanData)}`);
          break;
        case "Date":
          const dateValue = value.$DateValue;
          invariant(dateValue !== undefined);
          args.push(`$DateValue ${this.describeValue(dateValue)}`);
          break;
        case "ArrayBuffer":
          const len = value.$ArrayBufferByteLength;
          invariant(len !== undefined);
          args.push(`$ArrayBufferByteLength ${len}`);
          const db = value.$ArrayBufferData;
          invariant(db !== undefined);
          if (db !== null) args.push(`$ArrayBufferData [${db.join(", ")}]`);
          break;
        case "Float32Array":
        case "Float64Array":
        case "Int8Array":
        case "Int16Array":
        case "Int32Array":
        case "Uint8Array":
        case "Uint16Array":
        case "Uint32Array":
        case "Uint8ClampedArray":
        case "DataView":
          const buf = value.$ViewedArrayBuffer;
          invariant(buf !== undefined);
          args.push(`$ViewedArrayBuffer ${this.describeValue(buf)}`);
          break;
        case "Map":
          const mapDataEntries = value.$MapData;
          invariant(mapDataEntries !== undefined);
          args.push(`$MapData [${this.describeMapEntries(mapDataEntries)}]`);
          break;
        case "WeakMap":
          const weakMapDataEntries = value.$WeakMapData;
          invariant(weakMapDataEntries !== undefined);
          args.push(`$WeakMapData [${this.describeMapEntries(weakMapDataEntries)}]`);
          break;
        case "Set":
          const setDataEntries = value.$SetData;
          invariant(setDataEntries !== undefined);
          args.push(`$SetData [${this.describeSetEntries(setDataEntries)}]`);
          break;
        case "WeakSet":
          const weakSetDataEntries = value.$WeakSetData;
          invariant(weakSetDataEntries !== undefined);
          args.push(`$WeakSetData [${this.describeSetEntries(weakSetDataEntries)}]`);
          break;
        case "ReactElement":
        case "Object":
        case "Array":
          break;
        default:
          invariant(false);
      }
    }

    // properties
    if (value.properties.size > 0) {
      args.push(
        `properties [${Array.from(value.properties.keys())
          .map(key => this.describeKey(key))
          .join(", ")}]`
      );
    }

    // symbols
    if (value.symbols.size > 0) {
      args.push(
        `symbols [${Array.from(value.symbols.keys())
          .map(key => this.describeKey(key))
          .join(", ")}]`
      );
    }

    const unknownProperty = value.unknownProperty;
    if (unknownProperty !== undefined) args.push(`unknown property`);

    if (value.$Prototype !== undefined) args.push(`$Prototype ${this.describeValue(value.$Prototype)}`);

    this._printDefinition(this.objectValueName(value), value.constructor.name, args);

    // jull pull on property bindings to get them emitting
    for (const propertyBinding of value.properties.values()) this.describePropertyBinding(propertyBinding);
    for (const propertyBinding of value.symbols.values()) this.describePropertyBinding(propertyBinding);
    if (unknownProperty !== undefined) this.describePropertyBinding(unknownProperty);
  }

  describeValue(value: Value): string {
    if (value.intrinsicName !== undefined) return this.describeExpression(value.intrinsicName);
    if (value instanceof SymbolValue) return this.describeSymbol(value);
    if (value instanceof PrimitiveValue) return value.toDisplayString();
    if (value instanceof ObjectValue) {
      if (!this._objects.has(value)) {
        this._objects.add(value);
        this.printObjectValue(value);
      }
      return this.objectValueName(value);
    } else {
      invariant(value instanceof AbstractValue, value.constructor.name);
      if (!this._abstractValueIds.has(value)) {
        this._abstractValueIds.set(value, this._abstractValueIds.size);
        this.printAbstractValue(value);
      }
      return this.abstractValueName(value);
    }
  }

  describeMapEntries(entries: Array<{ $Key: void | Value, $Value: void | Value }>): string {
    return entries
      .map(entry => {
        const args = [];
        if (entry.$Key !== undefined) args.push(`$Key ${this.describeValue(entry.$Key)}`);
        if (entry.$Value !== undefined) args.push(`$Value ${this.describeValue(entry.$Value)}`);
        return `{${args.join(", ")}}`;
      })
      .join(", ");
  }

  describeSetEntries(entries: Array<void | Value>): string {
    return entries.map(entry => (entry === undefined ? "(undefined)" : this.describeValue(entry))).join(", ");
  }

  describeDescriptor(desc: Descriptor): string {
    if (desc instanceof PropertyDescriptor) return this.describePropertyDescriptor(desc);
    else if (desc instanceof InternalSlotDescriptor) return this.describeInternalSlotDescriptor(desc);
    else {
      invariant(desc instanceof AbstractJoinedDescriptor, desc.constructor.name);
      return this.describeAbstractJoinedDescriptor(desc);
    }
  }

  describePropertyDescriptor(desc: PropertyDescriptor): string {
    const args = [];
    if (desc.writable) args.push("writable");
    if (desc.enumerable) args.push("enumerable");
    if (desc.configurable) args.push("configurable");
    if (desc.value !== undefined) args.push(`value ${this.describeValue(desc.value)}`);
    if (desc.get !== undefined) args.push(`get ${this.describeValue(desc.get)}`);
    if (desc.set !== undefined) args.push(`set ${this.describeValue(desc.set)}`);
    return `PropertyDescriptor(${args.join(", ")})`;
  }

  describeInternalSlotDescriptor(desc: InternalSlotDescriptor): string {
    const args = [];
    if (desc.value instanceof Value) args.push(`value ${this.describeValue(desc.value)}`);
    else if (Array.isArray(desc.value)) args.push(`some array`); // TODO
    return `InternalSlotDescriptor(${args.join(", ")})`;
  }

  describeAbstractJoinedDescriptor(desc: AbstractJoinedDescriptor): string {
    const args = [];
    args.push(`join condition ${this.describeValue(desc.joinCondition)}`);
    if (desc.descriptor1 !== undefined) args.push(`descriptor1 ${this.describeDescriptor(desc.descriptor1)}`);
    if (desc.descriptor2 !== undefined) args.push(`descriptor2 ${this.describeDescriptor(desc.descriptor2)}`);
    return `AbstractJoinedDescriptor(${args.join(", ")})`;
  }

  bindingName(binding: Binding): string {
    invariant(this._bindings.has(binding));
    return `${this.describeEnvironmentRecord(binding.environment)}.${this.describeExpression(binding.name)}`;
  }

  printBinding(binding: Binding): void {
    const args = [];
    if (binding.isGlobal) args.push("is global");
    if (binding.mightHaveBeenCaptured) args.push("might have been captured");
    if (binding.initialized) args.push("initialized");
    if (binding.mutable) args.push("mutable");
    if (binding.deletable) args.push("deletable");
    if (binding.strict) args.push("strict");
    if (binding.hasLeaked) args.push("has leaked");
    if (binding.value !== undefined) args.push(`value ${this.describeValue(binding.value)})`);
    if (binding.phiNode !== undefined) args.push(`phi node ${this.describeValue(binding.phiNode)}`);
    this._printDefinition(this.bindingName(binding), "Binding", args);
  }

  describeBinding(binding: Binding): string {
    if (!this._bindings.has(binding)) {
      this._bindings.add(binding);
      this.printBinding(binding);
    }
    return this.bindingName(binding);
  }

  describeKey(key: void | string | Value): string {
    if (key === undefined) return "(undefined)";
    else if (typeof key === "string") return this.describeExpression(key);
    else {
      invariant(key instanceof Value);
      return this.describeValue(key);
    }
  }

  propertyBindingName(propertyBinding: PropertyBinding): string {
    return `${this.describeValue(propertyBinding.object)}.${this.describeKey(propertyBinding.key)}`;
  }

  printPropertyBinding(propertyBinding: PropertyBinding): void {
    const args = [];
    if (propertyBinding.internalSlot) args.push("internal slot");
    if (propertyBinding.descriptor !== undefined)
      args.push(`descriptor ${this.describeDescriptor(propertyBinding.descriptor)}`);
    if (propertyBinding.pathNode !== undefined) args.push(`path node ${this.describeValue(propertyBinding.pathNode)}`);
    this._printDefinition(this.propertyBindingName(propertyBinding), "PropertyBinding", args);
  }

  describePropertyBinding(propertyBinding: PropertyBinding): string {
    if (!this._propertyBindings.has(propertyBinding)) {
      this._propertyBindings.add(propertyBinding);
      this.printPropertyBinding(propertyBinding);
    }
    return this.propertyBindingName(propertyBinding);
  }

  environmentRecordName(environment: EnvironmentRecord): string {
    invariant(this._environmentRecords.has(environment));
    let name;
    if (environment instanceof DeclarativeEnvironmentRecord) {
      name = environment instanceof FunctionEnvironmentRecord ? "funEnv" : "declEnv";
    } else if (environment instanceof ObjectEnvironmentRecord) {
      name = "objEnv";
    } else {
      invariant(environment instanceof GlobalEnvironmentRecord);
      name = "globEnv";
    }
    return `${name}#${environment.id}`;
  }

  printEnvironmentRecord(environment: EnvironmentRecord): void {
    const args = [];
    if (environment instanceof DeclarativeEnvironmentRecord) {
      if (environment instanceof FunctionEnvironmentRecord) {
        args.push(`$ThisBindingStatus ${environment.$ThisBindingStatus}`);
        // TODO: $ThisValue should always be defined according to its flow type signature, however, it's not for test ObjectAssign9.js
        if (environment.$ThisValue !== undefined) args.push(`$ThisValue ${this.describeValue(environment.$ThisValue)}`);
        if (environment.$HomeObject !== undefined)
          args.push(`$HomeObject ${this.describeValue(environment.$HomeObject)}`);
        args.push(`$FunctionObject ${this.describeValue(environment.$FunctionObject)}`);
      }
      if (environment.$NewTarget !== undefined) args.push(`$NewTarget ${this.describeValue(environment.$NewTarget)}`);
      if (environment.frozen) args.push("frozen");
      const bindings = Object.keys(environment.bindings);
      if (bindings.length > 0)
        args.push(
          `bindings [${Object.keys(environment.bindings)
            .map(key => this.describeKey(key))
            .join(", ")}]`
        );
    } else if (environment instanceof ObjectEnvironmentRecord) {
      args.push(`object ${this.describeValue(environment.object)}`);
      if (environment.withEnvironment) args.push("with environment");
    } else if (environment instanceof GlobalEnvironmentRecord) {
      args.push(`$DeclarativeRecord ${this.describeEnvironmentRecord(environment.$DeclarativeRecord)}`);
      args.push(`$ObjectRecord ${this.describeEnvironmentRecord(environment.$DeclarativeRecord)}`);
      if (environment.$VarNames.length > 0)
        args.push(`$VarNames [${environment.$VarNames.map(varName => this.describeExpression(varName)).join(", ")}]`);
      args.push(`$GlobalThisValue ${this.describeValue(environment.$GlobalThisValue)}`);
    }
    this._printDefinition(this.environmentRecordName(environment), environment.constructor.name, args);

    // pull on bindings to get them emitted
    if (environment instanceof DeclarativeEnvironmentRecord)
      for (const bindingName in environment.bindings) this.describeBinding(environment.bindings[bindingName]);
  }

  describeEnvironmentRecord(environment: EnvironmentRecord): string {
    if (!this._environmentRecords.has(environment)) {
      this._environmentRecords.add(environment);
      this.printEnvironmentRecord(environment);
    }
    return this.environmentRecordName(environment);
  }

  describeBaseValue(value: void | EnvironmentRecord | Value): string {
    if (value === undefined) return "(undefined)";
    else if (value instanceof Value) return this.describeValue(value);
    invariant(value instanceof EnvironmentRecord);
    return this.describeEnvironmentRecord(value);
  }

  lexicalEnvironmentName(environment: LexicalEnvironment): string {
    invariant(this._lexicalEnvironments.has(environment));
    return `lexEnv#${environment._uid}`;
  }

  printLexicalEnvironment(environment: LexicalEnvironment): void {
    const args = [];
    if (environment.destroyed) args.push("destroyed");
    if (environment.parent !== null) args.push(`parent ${this.describeLexicalEnvironment(environment.parent)}`);
    args.push(`environment record ${this.describeEnvironmentRecord(environment.environmentRecord)}`);
    this._printDefinition(this.lexicalEnvironmentName(environment), "LexicalEnvironment", args);
  }

  describeLexicalEnvironment(environment: LexicalEnvironment): string {
    if (!this._lexicalEnvironments.has(environment)) {
      this._lexicalEnvironments.add(environment);
      this.printLexicalEnvironment(environment);
    }
    return this.lexicalEnvironmentName(environment);
  }

  symbolName(symbol: SymbolValue): string {
    const id = this._symbolIds.get(symbol);
    invariant(id !== undefined);
    return `symbol#${id}`;
  }

  printSymbol(symbol: SymbolValue): void {
    const args = [];
    if (symbol.$Description) args.push(`$Description ${this.describeValue(symbol.$Description)}`);
    this._printDefinition(this.symbolName(symbol), "Symbol", args);
  }

  describeSymbol(symbol: SymbolValue): string {
    if (!this._symbolIds.has(symbol)) {
      this._symbolIds.set(symbol, this._symbolIds.size);
    }
    if (!this._symbols.has(symbol)) {
      this._symbols.add(symbol);
      this.printSymbol(symbol);
    }
    return this.symbolName(symbol);
  }
}
