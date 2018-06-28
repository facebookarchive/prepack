/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "../invariant.js";
import { getTypeFromName } from "../utils.js";
import { Value, UndefinedValue, NullValue } from "../values/index.js";

type ShapeDescriptionCommon = {|
  optional: boolean,
  type: string,
|};

type ShapeDescriptionOfObject = ShapeDescriptionCommon & {|
  kind: "object",
  readonly: boolean,
  properties: { [string]: ShapeDescription },
|};

type ShapeDescriptionOfArray = ShapeDescriptionCommon & {|
  kind: "array",
  readonly: boolean,
  shape: ShapeDescription,
|};

type ShapeDescriptionOfLink = ShapeDescriptionCommon & {|
  kind: "link",
  shapeName: string,
|};

type ShapeDescriptionOfPrimitive = ShapeDescriptionCommon & {|
  kind: "primitive",
|};

export type ShapeDescriptionNonLink = ShapeDescriptionOfObject | ShapeDescriptionOfArray | ShapeDescriptionOfPrimitive;

export type ShapeDescription = ShapeDescriptionNonLink | ShapeDescriptionOfLink;

export type ShapeUniverse = { [string]: ShapeDescription };

export type ArgModel = {|
  universe: ShapeUniverse,
  arguments: { [string]: string },
|};

export class ShapeInformation {
  constructor(description: void | ShapeDescription, universe: void | ShapeUniverse) {
    // resolve links immediately
    while (description && description.kind === "link") {
      description = universe[description.shapeName];
    }
    this._description = description;
    this._universe = universe;
  }

  static unknownShape = new ShapeInformation(undefined, undefined);

  _description: void | ShapeDescriptionNonLink;
  _universe: void | ShapeUniverse;

  isKnown(): boolean {
    return this._description !== undefined;
  }

  isReadOnly(): boolean {
    invariant(this._description !== undefined);
    switch (this._description.kind) {
      case "object":
      case "array":
        return this._desctiption.readonly;
      case "primitive":
        return true;
      default:
        return false;
    }
  }

  getDescription(): ShapeDescriptionNonLink {
    invariant(this._description !== undefined);
    return this._description;
  }

  getValueTypeForAbstract(): typeof Value {
    if (this._description && !this._description.optional) {
      let type = getTypeFromName(this._description.type);
      // do not return NullValue or UndefinedValue as they cannot be
      // types for abstract value
      if (type && type !== NullValue && type !== UndefinedValue) {
        return type;
      }
    }
    return Value;
  }

  getMemberAccessShapeInformation(key: string): ShapeInformation {
    if (this._description === undefined) {
      return ShapeInformation.unknownShape;
    }
    invariant(this._description && this._universe);
    switch (this._description.kind) {
      case "object":
        return new ShapeInformation(this._description.properties[key], this._universe);
      case "array":
        switch (key) {
          case "length":
            return ShapeInformation._arrayLengthPropertyShape;
          case "prototype":
            return ShapeInformation.unknownShape;
          default:
            return new ShapeInformation(this._description.shape, this._universe);
        }
      default:
        // it is still legal to do member access on primitive value
        // such as string
        return ShapeInformation.unknownShape;
    }
  }

  static createForArgument(model: void | ArgModel, argname: string): ShapeInformation {
    return model && argname in model.arguments
      ? new ShapeInformation(model.universe[model.arguments[argname]], model.universe)
      : ShapeInformation.unknownShape;
  }

  static _arrayLengthPropertyShape = new ShapeInformation(
    {
      kind: "primitive",
      type: "integral",
      optional: false,
      readonly: false,
    },
    {}
  );
}
