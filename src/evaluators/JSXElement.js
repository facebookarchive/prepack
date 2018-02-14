/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import type {
  BabelNode,
  BabelNodeStringLiteral,
  BabelNodeJSXText,
  BabelNodeJSXElement,
  BabelNodeJSXIdentifier,
  BabelNodeJSXMemberExpression,
  BabelNodeJSXAttribute,
  BabelNodeJSXSpreadAttribute,
  BabelNodeJSXExpressionContainer,
} from "babel-types";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import {
  AbstractObjectValue,
  ArrayValue,
  StringValue,
  Value,
  NumberValue,
  ObjectValue,
  FunctionValue,
  AbstractValue,
} from "../values/index.js";
import { getReactSymbol } from "../react/utils.js";
import { convertJSXExpressionToIdentifier } from "../react/jsx.js";
import * as t from "babel-types";
import { Get } from "../methods/index.js";
import { Create, Environment, Properties } from "../singletons.js";
import invariant from "../invariant.js";
import { computeBinary } from "./BinaryExpression.js";

// taken from Babel
function cleanJSXElementLiteralChild(child: string): null | string {
  let lines = child.split(/\r\n|\n|\r/);

  let lastNonEmptyLine = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/[^ \t]/)) {
      lastNonEmptyLine = i;
    }
  }

  let str = "";

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    let isFirstLine = i === 0;
    let isLastLine = i === lines.length - 1;
    let isLastNonEmptyLine = i === lastNonEmptyLine;

    // replace rendered whitespace tabs with spaces
    let trimmedLine = line.replace(/\t/g, " ");

    // trim whitespace touching a newline
    if (!isFirstLine) {
      trimmedLine = trimmedLine.replace(/^[ ]+/, "");
    }

    // trim whitespace touching an endline
    if (!isLastLine) {
      trimmedLine = trimmedLine.replace(/[ ]+$/, "");
    }

    if (trimmedLine) {
      if (!isLastNonEmptyLine) {
        trimmedLine += " ";
      }

      str += trimmedLine;
    }
  }

  if (str) {
    return str;
  }
  return null;
}

function evaluateJSXMemberExpression(
  ast: BabelNode,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  switch (ast.type) {
    case "JSXIdentifier":
      return Environment.GetValue(
        realm,
        Environment.ResolveBinding(realm, ((ast: any): BabelNodeJSXIdentifier).name, strictCode, env)
      );
    case "JSXMemberExpression":
      return Environment.GetValue(
        realm,
        env.evaluate(convertJSXExpressionToIdentifier(((ast: any): BabelNodeJSXMemberExpression)), strictCode)
      );
    default:
      invariant(false, "Unknown JSX Identifier");
  }
}

function evaluateJSXIdentifier(ast, strictCode, env, realm): Value {
  if (isTagName(ast)) {
    // special cased lower-case and custom elements
    return new StringValue(realm, ((ast: any): BabelNodeJSXIdentifier).name);
  }
  return evaluateJSXMemberExpression(ast, strictCode, env, realm);
}

function evaluateJSXValue(value: BabelNode, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value {
  if (value != null) {
    switch (value.type) {
      case "JSXText":
        return new StringValue(realm, ((value: any): BabelNodeJSXText).value);
      case "StringLiteral":
        return new StringValue(realm, ((value: any): BabelNodeStringLiteral).value);
      case "JSXExpressionContainer":
        return Environment.GetValue(
          realm,
          env.evaluate(((value: any): BabelNodeJSXExpressionContainer).expression, strictCode)
        );
      case "JSXElement":
        return Environment.GetValue(realm, env.evaluate(value, strictCode));
      default:
        invariant(false, `Unknown JSX value type: ${value.type}`);
    }
  }
  invariant(false, `Null or undefined value passed when trying to evaluate JSX node value`);
}

function isTagName(ast: BabelNode): boolean {
  return ast.type === "JSXIdentifier" && /^[a-z]|\-/.test(((ast: any): BabelNodeJSXIdentifier).name);
}

function getDefaultProps(
  elementType: BabelNodeJSXIdentifier | BabelNodeJSXMemberExpression,
  env,
  realm: Realm
): null | ObjectValue {
  let name;
  if (elementType.type === "JSXIdentifier") {
    name = elementType.name;
  }
  if (!isTagName(elementType) && typeof name === "string") {
    // find the value of "ComponentXXX.defaultProps"
    let defaultProps = Environment.GetValue(
      realm,
      env.evaluate(t.memberExpression(t.identifier(name), t.identifier("defaultProps")), false)
    );

    if (defaultProps instanceof ObjectValue) {
      return defaultProps;
    }
  }
  return null;
}

function evaluateJSXChildren(
  children: Array<BabelNode>,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): ArrayValue | Value | null {
  if (children.length === 0) {
    return null;
  }
  if (children.length === 1) {
    let singleChild = evaluateJSXValue(children[0], strictCode, env, realm);

    if (singleChild instanceof StringValue) {
      let text = cleanJSXElementLiteralChild(singleChild.value);
      if (text !== null) {
        singleChild.value = text;
      }
    }
    return singleChild;
  }
  let array = Create.ArrayCreate(realm, 0);
  let dynamicChildrenLength = children.length;
  let dynamicIterator = 0;
  let lastChildValue = null;
  for (let i = 0; i < children.length; i++) {
    let value = evaluateJSXValue(children[i], strictCode, env, realm);
    if (value instanceof StringValue) {
      let text = cleanJSXElementLiteralChild(value.value);
      if (text === null) {
        dynamicChildrenLength--;
        // this is a space full of whitespace, so let's proceed
        continue;
      } else {
        value.value = text;
      }
    }
    lastChildValue = value;
    Create.CreateDataPropertyOrThrow(realm, array, "" + dynamicIterator, value);
    dynamicIterator++;
  }
  if (dynamicChildrenLength === 1) {
    return lastChildValue;
  }

  Properties.Set(realm, array, "length", new NumberValue(realm, dynamicChildrenLength), false);
  return array;
}

function evaluateJSXAttributes(
  elementType: BabelNodeJSXIdentifier | BabelNodeJSXMemberExpression,
  astAttributes: Array<BabelNodeJSXAttribute | BabelNodeJSXSpreadAttribute>,
  astChildren: Array<BabelNode>,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): { key: Value, props: ObjectValue | AbstractObjectValue, ref: Value } {
  let props = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  let children = evaluateJSXChildren(astChildren, strictCode, env, realm);
  let key = realm.intrinsics.null;
  let ref = realm.intrinsics.null;
  let defaultProps = getDefaultProps(elementType, env, realm);
  // to be used if we need to create an abstract props
  let abstractPropsArgs = [];

  let containsAbstractSpreadAttribute = false;
  let containsAbstractKey = false;
  let containsAbstractRef = false;
  let spreadAttributesCount = 0;
  let spreadAttributesWithInitialPropsHintCount = 0;
  let attributesAssigned = 0;

  const setProp = (name: string, value: Value, isDefaultProps: boolean): void => {
    if (name === "children") {
      if (isDefaultProps && children !== null) {
        return;
      }
      invariant(props instanceof ObjectValue);
      Properties.Set(realm, props, "children", value, true);
    } else if (name === "key" && value !== realm.intrinsics.null) {
      if (value instanceof AbstractValue) {
        containsAbstractKey = true;
      } else if (containsAbstractKey) {
        containsAbstractKey = false;
      }
      key = computeBinary(realm, "+", realm.intrinsics.emptyString, value);
    } else if (name === "ref") {
      if (value instanceof AbstractValue) {
        containsAbstractRef = true;
      } else if (containsAbstractRef) {
        containsAbstractRef = false;
      }
      ref = value;
    } else if (name !== "__self" && name !== "__source") {
      invariant(props instanceof ObjectValue);
      Properties.Set(realm, props, name, value, true);
    }
    attributesAssigned++;
  };

  // handle children
  if (children !== null) {
    setProp("children", children, false);
  }

  // defaultProps are a bit like default function arguments
  // if an actual value exists, it should overwrite the default value
  if (defaultProps !== null) {
    for (let [defaultPropKey] of defaultProps.properties) {
      setProp(defaultPropKey, Get(realm, defaultProps, defaultPropKey), true);
    }
  }

  for (let astAttribute of astAttributes) {
    switch (astAttribute.type) {
      case "JSXAttribute":
        let { name, value } = astAttribute;

        invariant(name.type === "JSXIdentifier", `JSX attribute name type not supported: ${astAttribute.type}`);
        setProp(name.name, evaluateJSXValue(((value: any): BabelNodeJSXIdentifier), strictCode, env, realm), false);
        break;
      case "JSXSpreadAttribute":
        let spreadValue = Environment.GetValue(realm, env.evaluate(astAttribute.argument, strictCode));

        if (spreadValue instanceof ObjectValue) {
          for (let [spreadPropKey] of spreadValue.properties) {
            setProp(spreadPropKey, Get(realm, spreadValue, spreadPropKey), false);
          }
        } else {
          spreadAttributesCount++;
          containsAbstractSpreadAttribute = true;
          // check to see if this object has an abstractHint
          invariant(spreadValue instanceof AbstractValue);
          let reactHint = realm.react.abstractHints.get(spreadValue);

          if (reactHint === "HAS_NO_KEY_OR_REF") {
            spreadAttributesWithInitialPropsHintCount++;
            // as we know initial props can't have a "props" or "key", we don't have
            // to mark them as abstract
          } else {
            // as the spread might contain "key" and "ref" we have to mark both
            // as being abstract too, as we don't know if they exist
            containsAbstractKey = true;
            containsAbstractRef = true;
          }
          // we push the props up to this point into the abstract props args. we also
          // push the abstract spread object and then we create a fresh props object
          abstractPropsArgs.push(props, spreadValue);
          props = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
        }
        break;
      default:
        invariant(false, `Unknown JSX attribute type: ${astAttribute.type}`);
    }
  }
  if (containsAbstractSpreadAttribute) {
    // if we haven't assigned any attributes and we are dealing with a single
    // spread attribute, we can just make the spread object the props
    if (attributesAssigned === 0) {
      props = abstractPropsArgs[1];
    } else {
      // we create an abstract Object.assign() to deal with the fact that we don't what
      // the props are because they contain abstract spread attributes that we can't
      // evaluate ahead of time
      let types = new TypesDomain(FunctionValue);
      let values = new ValuesDomain();
      let emptyObject = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
      invariant(realm.generator);
      props = realm.generator.derive(types, values, [emptyObject, ...abstractPropsArgs], _args => {
        return t.callExpression(
          t.memberExpression(t.identifier("Object"), t.identifier("assign")),
          ((_args: any): Array<any>)
        );
      });
      if (
        spreadAttributesCount === spreadAttributesWithInitialPropsHintCount &&
        spreadAttributesWithInitialPropsHintCount > 0
      ) {
        realm.react.abstractHints.set(props, "HAS_NO_KEY_OR_REF");
      }
      if (containsAbstractKey || containsAbstractRef) {
        // if either are abstract, this will impact the reconcilation process
        // and ultimately prevent us from folding ReactElements properly
        // so we unsafely allow this for now, but show a warning
        invariant(realm.react.logger);
        realm.react.logger.logWarning(
          props,
          `unable to evaluate "key" and "ref" on a ReactElement due to a JSXSpreadAttribute`
        );
      }
    }
  }
  invariant(props instanceof ObjectValue || props instanceof AbstractObjectValue);
  return { key, props, ref };
}

function createReactElement(
  realm: Realm,
  type: Value,
  key: Value,
  ref: Value,
  props: ObjectValue | AbstractObjectValue
): ObjectValue {
  let obj = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  Create.CreateDataPropertyOrThrow(realm, obj, "$$typeof", getReactSymbol("react.element", realm));
  Create.CreateDataPropertyOrThrow(realm, obj, "type", type);
  Create.CreateDataPropertyOrThrow(realm, obj, "key", key);
  Create.CreateDataPropertyOrThrow(realm, obj, "ref", ref);
  Create.CreateDataPropertyOrThrow(realm, obj, "props", props);
  Create.CreateDataPropertyOrThrow(realm, obj, "_owner", realm.intrinsics.null);
  return obj;
}

export default function(
  ast: BabelNodeJSXElement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): ObjectValue {
  invariant(realm.react.enabled, "JSXElements can only be evaluated with the reactEnabled option");
  let openingElement = ast.openingElement;
  let type = evaluateJSXIdentifier(openingElement.name, strictCode, env, realm);
  let { key, props, ref } = evaluateJSXAttributes(
    openingElement.name,
    openingElement.attributes,
    ast.children,
    strictCode,
    env,
    realm
  );

  return createReactElement(realm, type, key, ref, props);
}
