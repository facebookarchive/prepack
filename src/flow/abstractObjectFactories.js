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
import buildExpressionTemplate from "../utils/builder.js";
import { Create } from "../singletons.js";
import { ValuesDomain } from "../domains/index.js";
import { Value, AbstractValue, ObjectValue, ArrayValue, AbstractObjectValue } from "../values/index.js";
import invariant from "../invariant.js";
import { type ObjectTypeTemplate } from "./utils.js";

export function createObject(realm: Realm, shape: ObjectTypeTemplate | null, name: string | null): ObjectValue {
  let obj = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  if (shape != null) {
    // to get around Flow complaining that shape could be null
    let shapeThatIsNotNull = shape;
    Object.keys(shape).forEach((id: string) => {
      let value = shapeThatIsNotNull[id];
      invariant(value instanceof Value, "creation of object failed due to object containing non-value properties");
      obj.$Set(id, value, obj);
      if (name !== null) {
        value.intrinsicName = `${name}.${id}`;
      }
    });
  }
  if (name !== null) {
    obj.intrinsicName = name;
  }
  return obj;
}

export function createArray(realm: Realm, name: string | null): ArrayValue {
  let obj = Create.ArrayCreate(realm, 0, realm.intrinsics.ArrayPrototype);
  if (name !== null) {
    obj.intrinsicName = name;
  }
  return ((obj: any): ArrayValue);
}

function _createAbstractArray(realm: Realm, name: string): AbstractValue {
  let value = AbstractValue.createFromTemplate(realm, buildExpressionTemplate(name), ArrayValue, [], name);
  value.intrinsicName = name;
  let template = createArray(realm, name);
  template.makePartial();
  template.makeSimple();
  value.values = new ValuesDomain(new Set([template]));
  realm.rebuildNestedProperties(value, name);
  return value;
}

function _createAbstractObject(
  realm: Realm,
  name: string | null,
  objectTypes: ObjectTypeTemplate | null
): AbstractObjectValue {
  if (name === null) {
    name = "unknown";
  }
  let value = AbstractValue.createFromTemplate(realm, buildExpressionTemplate(name), ObjectValue, [], name);
  value.intrinsicName = name;
  let template = createObject(realm, objectTypes, name);
  template.makePartial();
  template.makeSimple();
  value.values = new ValuesDomain(new Set([template]));
  realm.rebuildNestedProperties(value, name);
  invariant(value instanceof AbstractObjectValue);
  return value;
}

export function createAbstractObject(
  realm: Realm,
  name: string | null,
  objectTypes: ObjectTypeTemplate | null | string
): AbstractObjectValue {
  if (typeof objectTypes === "string") {
    invariant(
      objectTypes === "empty" || objectTypes === "object",
      `Expected an object or a string of "empty" or "object" for createAbstractObject() paramater "objectTypes"`
    );
    return _createAbstractObject(realm, name, null);
  }
  if (objectTypes !== null) {
    let propTypeObject = {};
    let objTypes = objectTypes;
    invariant(objTypes);
    Object.keys(objTypes).forEach(key => {
      let value = objTypes[key];
      let propertyName = name !== null ? `${name}.${key}` : key;
      if (typeof value === "string") {
        if (value === "array") {
          propTypeObject[key] = _createAbstractArray(realm, propertyName);
        } else if (value === "object") {
          propTypeObject[key] = _createAbstractObject(realm, propertyName, null);
        } else {
          propTypeObject[key] = createAbstractByType(realm, value, propertyName);
        }
      } else if (typeof value === "object" && value !== null) {
        propTypeObject[key] = createAbstractObject(realm, propertyName, value);
      } else {
        invariant(false, `Unknown propType value of "${value}" for "${key}"`);
      }
    });

    return _createAbstractObject(realm, name, propTypeObject);
  } else {
    return _createAbstractObject(realm, name, null);
  }
}

export function createAbstractByType(realm: Realm, typeNameString: string, name: string): Value {
  let type = Value.getTypeFromName(typeNameString);
  invariant(type !== undefined, "createAbstractByType() cannot be undefined");
  let value = AbstractValue.createFromTemplate(realm, buildExpressionTemplate(name), type, [], name);
  value.intrinsicName = name;
  return value;
}
