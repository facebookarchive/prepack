/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { getTypeFromName } from "../utils.js";
import { Value, UndefinedValue, NullValue } from "../values/index.js";

type AbstractValueType =
  | "void"
  | "null"
  | "boolean"
  | "string"
  | "symbol"
  | "number"
  | "object"
  | "array"
  | "function"
  | "integral";

type ElementGetters = "bool" | "double" | "int" | "time" | "string";

type ListGetters = "bool_list" | "double_list" | "int_list" | "time_list" | "string_list" | "tree" | "tree_list";

type SupportedGetters = ElementGetters | ListGetters;

type ShapeDescriptorCommon = {
  optional: boolean,
  jsType: AbstractValueType,
  graphQLType?: string,
};

type ShapeDescriptorOfObject = ShapeDescriptorCommon & {
  kind: "object",
  readonly: boolean,
  properties: { [string]: void | ShapeDescriptor },
};

type ShapeDescriptorOfArray = ShapeDescriptorCommon & {
  kind: "array",
  readonly: boolean,
  shape: void | ShapeDescriptor,
};

type ShapeDescriptorOfLink = ShapeDescriptorCommon & {
  kind: "link",
  shapeName: string,
};

type ShapeDescriptorOfPrimitive = ShapeDescriptorCommon & {
  kind: "scalar",
};

type ShapeDescriptorOfEnum = ShapeDescriptorCommon & {
  kind: "enum",
};

export type ShapeDescriptorNonLink =
  | ShapeDescriptorOfObject
  | ShapeDescriptorOfArray
  | ShapeDescriptorOfPrimitive
  | ShapeDescriptorOfEnum;

export type ShapeDescriptor = ShapeDescriptorNonLink | ShapeDescriptorOfLink;

export type ShapeUniverse = { [string]: ShapeDescriptor };

export type ArgModel = {
  universe: ShapeUniverse,
  arguments: { [string]: string },
};

export class ShapeInformation {
  constructor(descriptor: ShapeDescriptorNonLink, universe: ShapeUniverse) {
    this._descriptor = descriptor;
    this._universe = universe;
  }

  _descriptor: ShapeDescriptorNonLink;
  _universe: ShapeUniverse;

  isReadOnly(): boolean {
    switch (this._descriptor.kind) {
      case "object":
      case "array":
        return this._descriptor.readonly;
      case "scalar":
        return true;
      default:
        return false;
    }
  }

  getDescriptor(): ShapeDescriptorNonLink {
    return this._descriptor;
  }

  getValueTypeForAbstract(): typeof Value {
    if (!this._descriptor.optional) {
      let type = getTypeFromName(this._descriptor.jsType);
      // do not return NullValue or UndefinedValue as they cannot be
      // types for abstract value
      if (type !== undefined && type !== NullValue && type !== UndefinedValue) {
        return type;
      }
    }
    return Value;
  }

  getMemberAccessShapeInformation(key: string): void | ShapeInformation {
    switch (this._descriptor.kind) {
      case "object":
        return ShapeInformation._resolveLinksAndWrap(this._descriptor.properties[key], this._universe);
      case "array":
        switch (key) {
          case "length":
            return ShapeInformation._arrayLengthPropertyShape;
          case "prototype":
            return undefined;
          default:
            return ShapeInformation._resolveLinksAndWrap(this._descriptor.shape, this._universe);
        }
      default:
        // it is still legal to do member access on primitive value
        // such as string
        return undefined;
    }
  }

  getMemberAccessGraphQLGetter(propertyShape: ShapeInformation): void | SupportedGetters {
    // we need getter only if we are inside of GraphQL object
    return this._descriptor.graphQLType !== undefined && this._descriptor.kind === "object"
      ? propertyShape._getGetter()
      : undefined;
  }

  _getGetter(): void | SupportedGetters {
    switch (this._descriptor.kind) {
      case "object":
        return "tree";
      case "array":
        let innerShape = ShapeInformation._resolveLinksAndWrap(this._descriptor.shape, this._universe);
        if (innerShape === undefined) {
          return undefined;
        }
        let innerGetter = innerShape._getGetter();
        // no supported for nested arrays
        return innerGetter !== undefined && !innerGetter.endsWith("_list") ? innerGetter + "_list" : undefined;
      case "scalar":
        switch (this._descriptor.graphQLType) {
          case "Color":
          case "File":
          case "ID":
          case "String":
          case "Url":
            return "string";
          case "Int":
          case "Time":
            return "int";
          case "Float":
            return "double";
          case "Boolean":
            return "bool";
          default:
            return undefined;
        }
      case "enum":
        return "string";
      default:
        return undefined;
    }
  }

  static _resolveLinksAndWrap(descriptor: void | ShapeDescriptor, universe: ShapeUniverse): void | ShapeInformation {
    while (descriptor && descriptor.kind === "link") {
      descriptor = universe[descriptor.shapeName];
    }
    return descriptor !== undefined ? new ShapeInformation(descriptor, universe) : undefined;
  }

  static createForArgument(model: void | ArgModel, argname: string): void | ShapeInformation {
    return model !== undefined
      ? ShapeInformation._resolveLinksAndWrap(model.universe[model.arguments[argname]], model.universe)
      : undefined;
  }

  static _arrayLengthPropertyShape = new ShapeInformation(
    {
      kind: "scalar",
      jsType: "integral",
      optional: false,
    },
    {}
  );
}
