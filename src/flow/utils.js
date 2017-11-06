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
import traverse from "babel-traverse";
import { BabelNode } from "babel-types";
import * as t from "babel-types";

export type ObjectTypeTemplate = {
  [key: string]: string | ObjectTypeTemplate,
};

export function flowAnnotationToObjectTypeTemplate(annotation: typeAnnotation): string | ObjectTypeTemplate {
  if (annotation.type === "TypeAnnotation") {
    return flowAnnotationToObjectTypeTemplate(annotation.typeAnnotation);
  } else if (annotation.type === "GenericTypeAnnotation") {
    if (annotation.id.type === "Identifier") {
      let identifier = annotation.id.name;

      switch (identifier) {
        case "Function":
          return "function";
        case "Object":
          return "object";
        case "Array":
          return "array";
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
  } else if (annotation.type === "FunctionTypeAnnotation") {
    return "function";
  } else if (annotation.type === "ArrayTypeAnnotation") {
    return "array";
  } else if (annotation.type === "ObjectTypeAnnotation") {
    let obj = {};
    annotation.properties.forEach(property => {
      if (property.type === "ObjectTypeProperty") {
        if (property.key.type === "Identifier") {
          obj[property.key.name] = flowAnnotationToObjectTypeTemplate(property.value);
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

// Taken directly from Babel:
// https://github.com/babel/babel/blob/cde005422701a69ff21044c138c29a5ad23b6d0a/packages/babel-plugin-transform-flow-strip-types/src/index.js#L32-L107
// Copyright 2015-present Sebastian McKenzie / Babel project (https://github.com/babel)
// only the lines reflected in the above were used
export function stripFlowTypeAnnotations(ast: BabelNode): void {
  traverse(
    ast,
    {
      ImportDeclaration(path) {
        if (!path.node.specifiers.length) return;
        let typeCount = 0;
        path.node.specifiers.forEach(({ importKind }) => {
          if (importKind === "type" || importKind === "typeof") {
            typeCount++;
          }
        });
        if (typeCount === path.node.specifiers.length) {
          path.remove();
        }
      },
      Flow(path) {
        path.remove();
      },
      ClassProperty(path) {
        path.node.variance = null;
        path.node.typeAnnotation = null;
        if (!path.node.value) path.remove();
      },
      Class(path) {
        path.node.implements = null;
        path.get("body.body").forEach(child => {
          if (child.isClassProperty()) {
            child.node.typeAnnotation = null;
            if (!child.node.value) child.remove();
          }
        });
      },
      AssignmentPattern({ node }) {
        node.left.optional = false;
      },
      Function({ node }) {
        for (let i = 0; i < node.params.length; i++) {
          const param = node.params[i];
          param.optional = false;
          if (param.type === "AssignmentPattern") {
            param.left.optional = false;
          }
        }
        node.predicate = null;
      },
      TypeCastExpression(path) {
        let { node } = path;
        do {
          node = node.expression;
        } while (t.isTypeCastExpression(node));
        path.replaceWith(node);
      },
    },
    undefined,
    (undefined: any),
    undefined
  );
}
