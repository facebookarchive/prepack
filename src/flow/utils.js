/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { typeAnnotation } from "babel-types";
import invariant from "../invariant.js";

export function flowAnnotationToObject(annotation: typeAnnotation) {
  if (annotation.type === "TypeAnnotation") {
    return flowAnnotationToObject(annotation.typeAnnotation);
  } else if (annotation.type === "GenericTypeAnnotation") {
    if (annotation.id.type === "Identifier") {
      let identifier = annotation.id.name;

      switch (identifier) {
        case "Function":
          return "function";
        case "Object":
          return "object";
        case "any":
        case "empty":
          return "empty";
        default:
          // get the Flow type
          invariant(false, "Flow types are currently not supported");
      }
    } else {
      invariant(false, "unknown generic Flow type annotation node");
    }
  } else if (annotation.type === "EmptyTypeAnnotation") {
    return "empty";
  } else if (annotation.type === "BooleanTypeAnnotation") {
    return "boolean";
  } else if (annotation.type === "StringTypeAnnotation") {
    return "string";
  } else if (annotation.type === "NumberTypeAnnotation") {
    return "number";
  } else if (annotation.type === "ObjectTypeAnnotation") {
    let obj = {};
    annotation.properties.forEach(property => {
      if (property.type === "ObjectTypeProperty") {
        if (property.key.type === "Identifier") {
          obj[property.key.name] = flowAnnotationToObject(property.value);
        } else {
          invariant(false, "only Identifier nodes are supported in ObjectTypeProperty keys");
        }
      } else {
        invariant(false, "only ObjectTypeProperty properties are supported in ObjectTypeAnnotation");
      }
    });
    return obj;
  } else if (annotation.type === "AnyTypeAnnotation") {
    return "empty";
  } else {
    invariant(false, "unknown Flow type annotation node");
  }
}
