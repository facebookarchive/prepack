/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Descriptor, PropertyBinding } from "../types.js";
import { EnvironmentRecord, type Binding } from "../environment.js";
import { PrimitiveValue, AbstractValue, ObjectValue, Value } from "../values/index.js";
import invariant from "../invariant.js";
import {
  Printer,
  Generator,
  type OperationDescriptorType,
  type CustomGeneratorEntryType,
  type OperationDescriptorData,
} from "./generator.js";

export class TextPrinter implements Printer {
  constructor(printLine: string => void) {
    this._printLine = printLine;
    this._indent = "";
    this._abstractValueIds = new Map();
  }

  _printLine: string => void;
  _indent: string;
  _abstractValueIds: Map<AbstractValue, number>;

  _nest(): void {
    this._indent += " ";
  }
  _unnest(): void {
    this._indent = this._indent.substring(0, this._indent.length - 1);
  }

  _print(text: string): void {
    this._printLine(this._indent + text);
  }

  printGeneratorEntry(
    declared: void | AbstractValue | ObjectValue,
    type: OperationDescriptorType | CustomGeneratorEntryType,
    args: Array<Value>,
    data: OperationDescriptorData,
    metadata: { isPure: boolean, mutatesOnly: void | Array<Value> }
  ): void {
    let text;
    if (declared !== undefined) {
      invariant(declared.intrinsicName !== undefined);
      text = `${declared.intrinsicName} := `;
    } else {
      text = "";
    }
    text += type;

    let dataTexts = [];
    if (args.length > 0) dataTexts.push(`args ${this.describeValues(args)}`);
    if (data.unaryOperator !== undefined) dataTexts.push(data.unaryOperator); // used by UNARY_EXPRESSION
    if (data.binaryOperator !== undefined) dataTexts.push(data.binaryOperator); // used by BINARY_EXPRESSION
    if (data.logicalOperator !== undefined) dataTexts.push(data.logicalOperator); // used by LOGICAL_EXPRESSION
    if (data.incrementor !== undefined) dataTexts.push(data.incrementor); // used by UPDATE_INCREMENTOR
    if (data.prefix !== undefined) dataTexts.push("prefix"); // used by UNARY_EXPRESSION
    if (data.binding !== undefined) dataTexts.push(`binding ${this.describeBinding(data.binding)}`); // used by GET_BINDING
    if (data.propertyBinding !== undefined)
      dataTexts.push(`property binding ${this.describePropertyBinding(data.propertyBinding)}`); // used by LOGICAL_PROPERTY_ASSIGNMENT
    if (data.object !== undefined) dataTexts.push(`object ${this.describeValue(data.object)}`); // used by DEFINE_PROPERTY
    if (data.descriptor !== undefined) dataTexts.push(`desc ${this.describeDescriptor(data.descriptor)}`); // used by DEFINE_PROPERTY
    if (data.value !== undefined) dataTexts.push(`value ${this.describeValue(data.value)}`); // used by DO_WHILE, CONDITIONAL_PROPERTY_ASSIGNMENT, LOGICAL_PROPERTY_ASSIGNMENT, LOCAL_ASSIGNMENT, CONDITIONAL_THROW, EMIT_PROPERTY_ASSIGNMENT
    if (data.id !== undefined) dataTexts.push(`id ${data.id}`); // used by IDENTIFIER
    if (data.thisArg !== undefined) dataTexts.push(`this arg ${this.describeBaseValue(data.thisArg)}`); // used by CALL_BAILOUT
    if (data.propRef !== undefined) dataTexts.push(`prop ref ${this.describeKey(data.propRef)}`); // used by CALL_BAILOUT, and then only if string
    if (data.state !== undefined) dataTexts.push(`state ${data.state}`); // used by PROPERTY_INVARIANT
    if (data.usesThis !== undefined) dataTexts.push(`usesThis`); // used by FOR_STATEMENT_FUNC
    if (data.path !== undefined) dataTexts.push(`path ${this.describeValue(data.path)}`); // used by PROPERTY_ASSIGNMENT, CONDITIONAL_PROPERTY_ASSIGNMENT
    if (data.callFunctionRef !== undefined) dataTexts.push(`call function ref ${data.callFunctionRef}`); // used by EMIT_CALL and EMIT_CALL_AND_CAPTURE_RESULT
    if (data.templateSource !== undefined) dataTexts.push(`template source ${data.templateSource}`); // used by ABSTRACT_FROM_TEMPLATE

    // TODO:
    // appendLastToInvariantOperationDescriptor?: OperationDescriptor, // used by INVARIANT
    // concreteComparisons?: Array<Value>, // used by FULL_INVARIANT_ABSTRACT
    // boundName?: BabelNodeIdentifier, // used by FOR_IN
    // lh?: BabelNodeVariableDeclaration, // used by FOR_IN
    // propertyGetter?: SupportedGraphQLGetters, // used by ABSTRACT_OBJECT_GET
    // quasis?: Array<BabelNodeTemplateElement>, // used by REACT_SSR_TEMPLATE_LITERAL
    // typeComparisons?: Set<typeof Value>, // used by FULL_INVARIANT_ABSTRACT
    // violationConditionOperationDescriptor?: OperationDescriptor, // used by INVARIANT
    if (dataTexts.length > 0) text += `(${dataTexts.join("; ")})`;

    let metadataTexts = [];
    if (metadata.isPure) metadataTexts.push("isPure");
    if (metadata.mutatesOnly !== undefined && metadata.mutatesOnly.length > 0)
      metadataTexts.push(`mutates only: ${this.describeValues(metadata.mutatesOnly)}`);
    if (metadataTexts.length > 0) text += `[${metadataTexts.join("; ")}]`;

    this._printLine(text);

    switch (type) {
      case "DO_WHILE":
        let generator = data.generator;
        invariant(generator !== undefined);
        this.printGenerator(generator, "body");
        break;
      case "JOIN_GENERATORS":
        let generators = data.generators;
        invariant(generators !== undefined && generators.length === 2);
        this.printGenerator(generators[0], "consequent");
        this.printGenerator(generators[1], "alternate");
        break;
      default:
        break;
    }
  }

  printGenerator(generator: Generator, label?: string = "(entry point)"): void {
    this._print(`${label}: ${generator.getName()}`);
    this._nest();
    if (generator.pathConditions.length > 0)
      this._print(`path conditions: ${this.describeValues(generator.pathConditions)}`);
    generator.print(this);
    this._unnest();
  }

  describeValues<V: Value>(values: Array<V>): string {
    return values.map(value => this.describeValue(value)).join(", ");
  }

  describeValue(value: Value): string {
    if (value instanceof PrimitiveValue) return value.toDisplayString();
    let text;
    if (value instanceof ObjectValue) text = `object#${value.getHash()}`;
    else {
      invariant(value instanceof AbstractValue, value.constructor.name);
      let id = this._abstractValueIds.get(value);
      if (id === undefined) this._abstractValueIds.set(value, (id = this._abstractValueIds.size));
      text = `abstract#${id}`;
    }
    if (value.intrinsicName) text += `[${value.intrinsicName}]`;
    // TODO: For objects, print all properties
    // TODO: For abstract values, "recurse" into arguments
    return text;
  }

  describeDescriptor(desc: Descriptor): string {
    let text = "";
    if (desc.writable) text += "writable ";
    if (desc.enumerable) text += "enumerable ";
    if (desc.configurable) text += "configurable ";
    if (desc.value !== undefined)
      if (desc.value instanceof Value) text += `value ${this.describeValue(desc.value)}`;
      else text += `value of internal slot`; // TODO
    if (desc.get !== undefined) text += `get ${this.describeValue(desc.get)}`;
    if (desc.set !== undefined) text += `set ${this.describeValue(desc.set)}`;

    // TODO: joinCondition, descriptor1, descriptor2
    return text;
  }

  describeBinding(binding: Binding): string {
    // TODO: Consider emitting just the binding identity here, and print actual bindings separately
    let text = `${binding.name}: ${this.describeBaseValue(binding.environment)} `;
    if (binding.isGlobal) text += "is global ";
    if (binding.mightHaveBeenCaptured) text += "might have been captured ";
    if (binding.initialized) text += "initialized ";
    if (binding.mutable) text += "mutable ";
    if (binding.deletable) text += "deletable ";
    if (binding.strict) text += "strict ";
    if (binding.hasLeaked) text += "has leaked ";
    if (binding.value !== undefined) text += `value ${this.describeValue(binding.value)}`;
    if (binding.phiNode !== undefined) text += `phi node ${this.describeValue(binding.phiNode)}`;
    return text;
  }

  describeKey(key: void | string | Value): string {
    if (key === undefined) return "(undefined)";
    else if (typeof key === "string") return key;
    else {
      invariant(key instanceof Value);
      return this.describeValue(key);
    }
  }

  describePropertyBinding(propertyBinding: PropertyBinding): string {
    // TODO: Consider emitting just the property binding identity here, and print actual property bindings separately
    let text = `${this.describeValue(propertyBinding.object)}.${this.describeKey(propertyBinding.key)}: `;
    if (propertyBinding.internalSlot) text += "internal slot ";
    if (propertyBinding.descriptor !== undefined)
      text += `descriptor ${this.describeDescriptor(propertyBinding.descriptor)}`;
    if (propertyBinding.pathNode !== undefined)
      text += `path node ${this.describeDescriptor(propertyBinding.pathNode)}`;
    return text;
  }

  describeBaseValue(value: void | EnvironmentRecord | Value): string {
    if (value === undefined) return "(undefined)";
    else if (value instanceof Value) return this.describeValue(value);
    invariant(value instanceof EnvironmentRecord);
    // TODO: Consider emitting just the environment identity here, and print actual environments separately
    // TODO: Print all entries
    return "environment record";
  }
}
