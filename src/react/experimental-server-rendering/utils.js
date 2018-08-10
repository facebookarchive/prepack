/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

// Warning: This code is experimental and might not fully work. There is no guarantee
// that is up-to-date with the curent react-dom/server logic and there may also be
// security holes in the string escaping because of this.

import type { Realm } from "../../realm.js";
import { parseExpression } from "@babel/parser";
import {
  AbstractObjectValue,
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  NumberValue,
  ObjectValue,
  StringValue,
  Value,
} from "../../values/index.js";
import { getProperty } from "../utils.js";
import invariant from "../../invariant.js";
import type { ReactNode } from "./rendering.js";
import { ROOT_ATTRIBUTE_NAME } from "./dom-config.js";

const matchHtmlRegExp = /["'&<>]/;

export function createMarkupForRoot(): string {
  return ROOT_ATTRIBUTE_NAME + '=""';
}

export function isCustomComponent(
  realm: Realm,
  tagName: string,
  propsValue: ObjectValue | AbstractObjectValue
): boolean {
  if (tagName.indexOf("-") === -1) {
    let is = getProperty(realm, propsValue, "is");
    return is instanceof StringValue;
  }
  switch (tagName) {
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      return false;
    default:
      return true;
  }
}

// $FlowFixMe: we don't want to provides types here as we inject this function into source
export function escapeHtml(string): string {
  if (typeof string === "boolean" || typeof string === "number") {
    return "" + string;
  }
  let str = "" + string;
  let match = matchHtmlRegExp.exec(str);

  if (!match) {
    return str;
  }

  let escape;
  let html = "";
  let index = 0;
  let lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34:
        escape = "&quot;";
        break;
      case 38:
        escape = "&amp;";
        break;
      case 39:
        escape = "&#x27;";
        break;
      case 60:
        escape = "&lt;";
        break;
      case 62:
        escape = "&gt;";
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index ? html + str.substring(lastIndex, index) : html;
}

export function normalizeNode(realm: Realm, reactNode: ReactNode): ReactNode {
  if (Array.isArray(reactNode)) {
    let newReactNode;

    for (let element of reactNode) {
      if (typeof element === "string") {
        if (newReactNode === undefined) {
          newReactNode = element;
        } else if (typeof newReactNode === "string") {
          newReactNode += element;
        } else {
          let lastNode = newReactNode[newReactNode.length - 1];
          if (typeof lastNode === "string") {
            newReactNode[newReactNode.length - 1] += element;
          } else {
            newReactNode.push(element);
          }
        }
      } else if (newReactNode === undefined) {
        newReactNode = ([element]: Array<ReactNode>);
      } else if (typeof newReactNode === "string") {
        newReactNode = ([newReactNode, element]: Array<ReactNode>);
      } else {
        newReactNode.push(element);
      }
    }
    invariant(newReactNode !== undefined);
    return newReactNode;
  } else if (typeof reactNode === "string" || reactNode instanceof AbstractValue) {
    return reactNode;
  }
  invariant(false, "TODO");
}

export function convertValueToNode(value: Value): ReactNode {
  if (value instanceof AbstractValue) {
    return value;
  } else if (value instanceof StringValue || value instanceof NumberValue) {
    return value.value + "";
  }
  invariant(false, "TODO");
}

export function createHtmlEscapeHelper(realm: Realm): ECMAScriptSourceFunctionValue {
  let escapeHelperAst = parseExpression(escapeHtml.toString(), { plugins: ["flow"] });
  let helper = new ECMAScriptSourceFunctionValue(realm);
  helper.initialize(escapeHelperAst.params, escapeHelperAst.body);
  return helper;
}

export function createArrayHelper(realm: Realm): ECMAScriptSourceFunctionValue {
  let arrayHelper = `
    function arrayHelper(array) {
      let length = array.length;
      let i = 0;
      let str = "";
      let item;

      while (i < length) {
        item = array[i++];
        if (previousWasTextNode === true) {
          str += "<!-- -->" + item;
        } else {
          str += item;
        }
        previousWasTextNode = item[0] !== "<";
      }
      return str;
    }
  `;

  let escapeHelperAst = parseExpression(arrayHelper, { plugins: ["flow"] });
  let helper = new ECMAScriptSourceFunctionValue(realm);
  helper.initialize(escapeHelperAst.params, escapeHelperAst.body);
  return helper;
}

export function getNonChildrenInnerMarkup(
  realm: Realm,
  propsValue: ObjectValue | AbstractObjectValue
): ReactNode | null {
  let innerHTML = getProperty(realm, propsValue, "dangerouslySetInnerHTML");

  if (innerHTML instanceof ObjectValue) {
    let _html = getProperty(realm, innerHTML, "dangerouslySetInnerHTML");

    if (_html instanceof StringValue) {
      return _html.value;
    }
  } else {
    let content = getProperty(realm, propsValue, "children");

    if (content instanceof StringValue || content instanceof NumberValue) {
      return escapeHtml(content.value);
    }
  }
  return null;
}

export function quoteAttributeValueForBrowser(value: string): string {
  return '"' + escapeHtml(value) + '"';
}
