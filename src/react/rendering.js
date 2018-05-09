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
import type { FunctionBodyAstNode } from "../types.js";
import { parseExpression } from "babylon";
import { ReactStatistics } from "../serializer/types.js";
import {
  AbstractObjectValue,
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  Value,
  ArrayValue,
} from "../values/index.js";
import { Reconciler } from "./reconcilation.js";
import {
  createReactEvaluatedNode,
  forEachArrayValue,
  getComponentName,
  getProperty,
  getReactSymbol,
  isReactElement,
} from "./utils.js";
import * as t from "babel-types";
import invariant from "../invariant.js";

type ReactNode = Array<ReactNode> | string | AbstractValue;
type PropertyType = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type PropertyInfo = {|
  +acceptsBooleans: boolean,
  +attributeName: string,
  +attributeNamespace: string | null,
  +mustUseProperty: boolean,
  +propertyName: string,
  +type: PropertyType,
|};

const STYLE = "style";
const RESERVED_PROPS = new Set([
  "children",
  "dangerouslySetInnerHTML",
  "suppressContentEditableWarning",
  "suppressHydrationWarning",
]);
const ROOT_ATTRIBUTE_NAME = "data-reactroot";
const matchHtmlRegExp = /["'&<>]/;
const omittedCloseTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const newlineEatingTags = {
  listing: true,
  pre: true,
  textarea: true,
};

const RESERVED = 0;
const STRING = 1;
const BOOLEANISH_STRING = 2;
const BOOLEAN = 3;
const OVERLOADED_BOOLEAN = 4;
const NUMERIC = 5;
const POSITIVE_NUMERIC = 6;

const properties = {};

function PropertyInfoRecord(
  name: string,
  type: PropertyType,
  mustUseProperty: boolean,
  attributeName: string,
  attributeNamespace: string | null
) {
  this.acceptsBooleans = type === BOOLEANISH_STRING || type === BOOLEAN || type === OVERLOADED_BOOLEAN;
  this.attributeName = attributeName;
  this.attributeNamespace = attributeNamespace;
  this.mustUseProperty = mustUseProperty;
  this.propertyName = name;
  this.type = type;
}

[["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(
  ([name, attributeName]) => {
    properties[name] = new PropertyInfoRecord(name, STRING, false, attributeName, null);
  }
);

[
  "children",
  "dangerouslySetInnerHTML",
  "defaultValue",
  "defaultChecked",
  "innerHTML",
  "suppressContentEditableWarning",
  "suppressHydrationWarning",
  "style",
].forEach(name => {
  properties[name] = new PropertyInfoRecord(name, RESERVED, false, name, null);
});

function getPropertyInfo(name: string): PropertyInfo | null {
  return properties.hasOwnProperty(name) ? properties[name] : null;
}

export function shouldIgnoreAttribute(
  name: string,
  propertyInfo: PropertyInfo | null,
  isCustomComponentTag: boolean
): boolean {
  if (propertyInfo !== null) {
    return propertyInfo.type === RESERVED;
  }
  if (isCustomComponentTag) {
    return false;
  }
  if (name.length > 2 && (name[0] === "o" || name[0] === "O") && (name[1] === "n" || name[1] === "N")) {
    return true;
  }
  return false;
}

function shouldRemoveAttribute(
  realm: Realm,
  name: string,
  value: Value,
  propertyInfo: PropertyInfo | null,
  isCustomComponentTag: boolean
): boolean {
  if (value === realm.intrinsics.null || value === realm.intrinsics.undefined) {
    return true;
  }
  // if (
  //   shouldRemoveAttributeWithWarning(
  //     name,
  //     value,
  //     propertyInfo,
  //     isCustomComponentTag,
  //   )
  // ) {
  //   return true;
  // }
  if (isCustomComponentTag) {
    return false;
  }
  if (propertyInfo !== null) {
    switch (propertyInfo.type) {
      case BOOLEAN:
        return !value;
      case OVERLOADED_BOOLEAN:
        return value === false;
      case NUMERIC:
        return isNaN(value);
      case POSITIVE_NUMERIC:
        return isNaN(value) || (value: any) < 1;
      default:
        return false;
    }
  }
  return false;
}

function createMarkupForRoot(): string {
  return ROOT_ATTRIBUTE_NAME + '=""';
}

function renderAbstractWithEscaping(
  realm: Realm,
  value: AbstractValue,
  htmlEscapeHelper: ECMAScriptSourceFunctionValue
): AbstractValue {
  // given we know nothing of this value, we need to escape the contents of it at runtime
  let val = AbstractValue.createFromBuildFunction(realm, Value, [htmlEscapeHelper, value], ([helperNode, valueNode]) =>
    t.callExpression(helperNode, [valueNode])
  );
  invariant(val instanceof AbstractValue);
  return val;
}

function isCustomComponent(realm: Realm, tagName: string, propsValue: ObjectValue | AbstractObjectValue): boolean {
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

function createMarkupForProperty(
  realm: Realm,
  name: string,
  value: Value,
  htmlEscapeHelper: ECMAScriptSourceFunctionValue
): ReactNode {
  const propertyInfo = getPropertyInfo(name);
  if (name !== "style" && shouldIgnoreAttribute(name, propertyInfo, false)) {
    return "";
  }
  if (shouldRemoveAttribute(realm, name, value, propertyInfo, false)) {
    return "";
  }
  if (propertyInfo !== null) {
    const attributeName = propertyInfo.attributeName;
    const { type } = propertyInfo;
    if (type === BOOLEAN || (type === OVERLOADED_BOOLEAN && value === true)) {
      return attributeName + '=""';
    } else if (value instanceof StringValue || value instanceof NumberValue) {
      return attributeName + "=" + quoteAttributeValueForBrowser(value.value + "");
    } else if (value instanceof AbstractValue) {
      return [attributeName + "=", renderAbstractWithEscaping(realm, value, htmlEscapeHelper)];
    }
  } else if (value instanceof StringValue || value instanceof NumberValue) {
    return name + "=" + quoteAttributeValueForBrowser(value.value + "");
  } else if (value instanceof AbstractValue) {
    return [name + "=", renderAbstractWithEscaping(realm, value, htmlEscapeHelper)];
  }
  invariant(false, "TODO");
}

function quoteAttributeValueForBrowser(value: string): string {
  return '"' + escapeHtml(value) + '"';
}

function createOpenTagMarkup(
  realm: Realm,
  tagVerbatim: string,
  tagLowercase: string,
  propsValue: ObjectValue | AbstractObjectValue,
  namespace: string,
  makeStaticMarkup: boolean,
  isRootElement: boolean,
  htmlEscapeHelper: ECMAScriptSourceFunctionValue
): Array<ReactNode> {
  let ret = ["<" + tagVerbatim];

  if (propsValue instanceof ObjectValue && !propsValue.isPartialObject()) {
    for (let [propName, binding] of propsValue.properties) {
      if (binding.descriptor !== undefined) {
        let propValue = getProperty(realm, propsValue, propName);
        if (propValue === realm.intrinsics.null || propValue === realm.intrinsics.undefined) {
          continue;
        }
        if (propName === STYLE) {
          // propValue = createMarkupForStyles(propValue);
          invariant(false, "TODO");
        }
        let markup;

        if (isCustomComponent(realm, tagLowercase, propsValue)) {
          if (!RESERVED_PROPS.has(propName)) {
            invariant(false, "TODO");
            // markup = createMarkupForCustomAttribute(propName, propValue);
          }
        } else {
          markup = createMarkupForProperty(realm, propName, propValue, htmlEscapeHelper);
        }
        if (Array.isArray(markup)) {
          ret.push(" ", ...markup);
        } else if (typeof markup === "string" && markup !== "") {
          ret.push(" " + markup);
        } else if (markup) {
          ret.push(" ", markup);
        }
      }
    }
  } else {
    invariant(false, "TODO");
  }

  // For static pages, no need to put React ID and checksum. Saves lots of
  // bytes.
  if (makeStaticMarkup) {
    return ret;
  }

  if (isRootElement) {
    ret.push(" " + createMarkupForRoot());
  }
  return ret;
}

function escapeHtml(string) {
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

function getNonChildrenInnerMarkup(realm: Realm, propsValue: ObjectValue | AbstractObjectValue): ReactNode | null {
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

function normalizeNode(realm: Realm, reactNode: ReactNode): ReactNode {
  let newReactNode;

  if (Array.isArray(reactNode)) {
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
        newReactNode = [element];
      } else if (typeof newReactNode === "string") {
        newReactNode = [newReactNode, element];
      } else {
        newReactNode.push(element);
      }
    }
  }
  invariant(newReactNode);
  return newReactNode;
}

function convertValueToNode(value: Value): ReactNode {
  if (value instanceof AbstractValue) {
    return value;
  } else if (value instanceof StringValue || value instanceof NumberValue) {
    return value.value + "";
  }
  invariant(false, "TODO");
}

function createHtmlEscapeHelper(realm: Realm) {
  let escapeHelperAst = parseExpression(escapeHtml.toString(), { plugins: ["flow"] });
  let helper = new ECMAScriptSourceFunctionValue(realm);
  let body = escapeHelperAst.body;
  body.body.unshift(
    t.variableDeclaration("var", [t.variableDeclarator(t.identifier("matchHtmlRegExp"), t.regExpLiteral("[\"'&<>]"))])
  );
  ((body: any): FunctionBodyAstNode).uniqueOrderedTag = realm.functionBodyUniqueTagSeed++;
  helper.$ECMAScriptCode = body;
  helper.$FormalParameters = escapeHelperAst.params;
  return helper;
}

class ReactDOMServerRenderer {
  constructor(realm: Realm, makeStaticMarkup: boolean) {
    this.realm = realm;
    this.makeStaticMarkup = makeStaticMarkup;
    this.previousWasTextNode = false;
    this.htmlEscapeHelper = createHtmlEscapeHelper(realm);
  }
  realm: Realm;
  makeStaticMarkup: boolean;
  previousWasTextNode: boolean;
  htmlEscapeHelper: ECMAScriptSourceFunctionValue;

  render(value: Value, namespace: string = "html", depth: number = 0): StringValue | AbstractValue {
    let rootReactNode = this._renderValue(value, namespace, depth);
    let normalizedNode = normalizeNode(this.realm, rootReactNode);
    if (typeof normalizedNode === "string") {
      return new StringValue(this.realm, normalizedNode);
    }
    invariant(Array.isArray(normalizedNode));
    let args = [];
    let quasis = [];
    let lastWasAbstract = false;
    for (let element of normalizedNode) {
      if (typeof element === "string") {
        lastWasAbstract = false;
        quasis.push(t.templateElement({ raw: element, cooked: element }));
      } else {
        if (lastWasAbstract) {
          quasis.push(t.templateElement({ raw: "", cooked: "" }));
        }
        lastWasAbstract = true;
        invariant(element instanceof Value);
        args.push(element);
      }
    }
    let val = AbstractValue.createFromBuildFunction(this.realm, StringValue, args, valueNodes =>
      t.templateLiteral(((quasis: any): Array<any>), valueNodes)
    );
    invariant(val instanceof AbstractValue);
    return val;
  }

  _renderText(value: StringValue | NumberValue): string {
    let text = value.value + "";

    if (text === "") {
      return "";
    }
    if (this.makeStaticMarkup) {
      return escapeHtml(text);
    }
    if (this.previousWasTextNode) {
      return "<!-- -->" + escapeHtml(text);
    }
    this.previousWasTextNode = true;
    return escapeHtml(text);
  }

  _renderAbstractConditionalValue(
    condValue: AbstractValue,
    consequentVal: Value,
    alternateVal: Value,
    namespace: string,
    depth: number
  ): ReactNode {
    let val = AbstractValue.evaluateWithAbstractConditional(
      this.realm,
      condValue,
      () => {
        return this.realm.evaluateForEffects(
          () => this.render(consequentVal, namespace, depth),
          null,
          "_renderAbstractConditionalValue consequent"
        );
      },
      () => {
        invariant(false, "TODO");
      },
      () => {
        return this.realm.evaluateForEffects(
          () => this.render(alternateVal, namespace, depth),
          null,
          "_renderAbstractConditionalValue consequent"
        );
      },
      () => {
        invariant(false, "TODO");
      }
    );
    return convertValueToNode(val);
  }

  _renderAbstractValue(value: AbstractValue, namespace: string, depth: number): ReactNode {
    if (value.kind === "conditional") {
      let [condValue, consequentVal, alternateVal] = value.args;
      invariant(condValue instanceof AbstractValue);
      return this._renderAbstractConditionalValue(condValue, consequentVal, alternateVal, namespace, depth);
    } else {
      return renderAbstractWithEscaping(this.realm, value, this.htmlEscapeHelper);
    }
  }

  _renderArrayValue(value: ArrayValue, namespace: string, depth: number): Array<ReactNode> {
    let elements = [];
    forEachArrayValue(this.realm, value, elementValue => {
      let renderedElement = this._renderValue(elementValue, namespace, depth);
      if (Array.isArray(renderedElement)) {
        elements.push(...renderedElement);
      } else {
        elements.push(renderedElement);
      }
    });
    return elements;
  }

  _renderReactElement(reactElement: ObjectValue, namespace: string, depth: number): Array<ReactNode> {
    let typeValue = getProperty(this.realm, reactElement, "type");
    let propsValue = getProperty(this.realm, reactElement, "props");

    invariant(propsValue instanceof AbstractObjectValue || propsValue instanceof ObjectValue);
    if (typeValue instanceof StringValue) {
      let type = typeValue.value;
      let tag = type.toLowerCase();

      if (tag === "input") {
        invariant(false, "TODO");
      } else if (tag === "textarea") {
        invariant(false, "TODO");
      } else if (tag === "select") {
        invariant(false, "TODO");
      } else if (tag === "option") {
        invariant(false, "TODO");
      }
      let out = createOpenTagMarkup(
        this.realm,
        type,
        tag,
        propsValue,
        namespace,
        this.makeStaticMarkup,
        depth === 0,
        this.htmlEscapeHelper
      );
      let footer = "";

      if (omittedCloseTags.has(tag)) {
        out.push("/>");
      } else {
        out.push(">");
        footer = "</" + type + ">";
      }
      let innerMarkup = getNonChildrenInnerMarkup(this.realm, propsValue);
      if (innerMarkup instanceof StringValue) {
        if (newlineEatingTags[tag] && innerMarkup.value.charAt(0) === "\n") {
          out.push("\n");
        }
        out.push(innerMarkup.value);
      } else if (innerMarkup instanceof ObjectValue) {
        invariant(false, "TODO");
      } else {
        let childrenValue = getProperty(this.realm, propsValue, "children");
        let childrenOut = this._renderValue(childrenValue, namespace, depth + 1);

        if (Array.isArray(childrenOut)) {
          out.push(...childrenOut);
        } else {
          out.push(childrenOut);
        }
      }
      out.push(footer);
      this.previousWasTextNode = false;
      return out;
    } else if (typeValue instanceof SymbolValue && typeValue === getReactSymbol("react.fragment", this.realm)) {
      let childrenValue = getProperty(this.realm, propsValue, "children");
      let childrenOut = this._renderValue(childrenValue, namespace, depth + 1);
      let out = [];

      if (Array.isArray(childrenOut)) {
        out.push(...childrenOut);
      } else {
        out.push(childrenOut);
      }
      this.previousWasTextNode = false;
      return out;
    } else {
      invariant(false, "TODO");
    }
  }

  _renderValue(value: Value, namespace: string, depth: number): ReactNode {
    if (value instanceof StringValue || value instanceof NumberValue) {
      return this._renderText(value);
    } else if (value instanceof ObjectValue && isReactElement(value)) {
      return this._renderReactElement(value, namespace, depth);
    } else if (value instanceof AbstractValue) {
      return this._renderAbstractValue(value, namespace, depth);
    } else if (value instanceof ArrayValue) {
      return this._renderArrayValue(value, namespace, depth);
    }
    invariant(false, "TODO");
  }
}

export function renderToString(
  realm: Realm,
  reactElement: ObjectValue,
  staticMarkup: boolean
): StringValue | AbstractValue {
  let reactStatistics = new ReactStatistics();
  let reconciler = new Reconciler(realm, { firstRenderOnly: true }, reactStatistics);
  let typeValue = getProperty(realm, reactElement, "type");
  let propsValue = getProperty(realm, reactElement, "props");
  let evaluatedRootNode = createReactEvaluatedNode("ROOT", getComponentName(realm, typeValue));
  invariant(typeValue instanceof ECMAScriptSourceFunctionValue);
  invariant(propsValue instanceof ObjectValue || propsValue instanceof AbstractObjectValue);
  let effects = reconciler.renderReactComponentTree(typeValue, propsValue, null, evaluatedRootNode);

  invariant(effects);
  realm.applyEffects(effects);
  invariant(effects.result instanceof Value);
  let serverRenderer = new ReactDOMServerRenderer(realm, staticMarkup);
  return serverRenderer.render(effects.result);
}
