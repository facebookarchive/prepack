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
  ArrayValue,
  BooleanValue,
  ECMAScriptSourceFunctionValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  Value,
  UndefinedValue,
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
import hyphenateStyleName from "fbjs/lib/hyphenateStyleName";

type ReactNode = Array<ReactNode> | string | AbstractValue | ArrayValue;
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
const isUnitlessNumber = {
  animationIterationCount: true,
  borderImageOutset: true,
  borderImageSlice: true,
  borderImageWidth: true,
  boxFlex: true,
  boxFlexGroup: true,
  boxOrdinalGroup: true,
  columnCount: true,
  columns: true,
  flex: true,
  flexGrow: true,
  flexPositive: true,
  flexShrink: true,
  flexNegative: true,
  flexOrder: true,
  gridRow: true,
  gridRowEnd: true,
  gridRowSpan: true,
  gridRowStart: true,
  gridColumn: true,
  gridColumnEnd: true,
  gridColumnSpan: true,
  gridColumnStart: true,
  fontWeight: true,
  lineClamp: true,
  lineHeight: true,
  opacity: true,
  order: true,
  orphans: true,
  tabSize: true,
  widows: true,
  zIndex: true,
  zoom: true,

  // SVG-related properties
  fillOpacity: true,
  floodOpacity: true,
  stopOpacity: true,
  strokeDasharray: true,
  strokeDashoffset: true,
  strokeMiterlimit: true,
  strokeOpacity: true,
  strokeWidth: true,
};
const prefixes = ["Webkit", "ms", "Moz", "O"];

Object.keys(isUnitlessNumber).forEach(function(prop) {
  prefixes.forEach(function(prefix) {
    isUnitlessNumber[prefixKey(prefix, prop)] = isUnitlessNumber[prop];
  });
});

function prefixKey(prefix, key) {
  return prefix + key.charAt(0).toUpperCase() + key.substring(1);
}

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

function renderValueWithHelper(realm: Realm, value: Value, helper: ECMAScriptSourceFunctionValue): AbstractValue {
  // given we know nothing of this value, we need to escape the contents of it at runtime
  let val = AbstractValue.createFromBuildFunction(realm, Value, [helper, value], ([helperNode, valueNode]) =>
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
      return [attributeName + "=", renderValueWithHelper(realm, value, htmlEscapeHelper)];
    }
  } else if (value instanceof StringValue || value instanceof NumberValue) {
    return name + "=" + quoteAttributeValueForBrowser(value.value + "");
  } else if (value instanceof AbstractValue) {
    return [name + '="', renderValueWithHelper(realm, value, htmlEscapeHelper), '"'];
  }
  invariant(false, "TODO");
}

function dangerousStyleValue(realm: Realm, name: string, value: Value, isCustomProperty: boolean): string {
  let isEmpty =
    value === realm.intrinsics.null ||
    value === realm.intrinsics.undefined ||
    value instanceof BooleanValue ||
    (value instanceof StringValue && value.value === "");
  if (isEmpty) {
    return "";
  }

  if (
    !isCustomProperty &&
    value instanceof NumberValue &&
    value.value !== 0 &&
    !(isUnitlessNumber.hasOwnProperty(name) && isUnitlessNumber[name])
  ) {
    return value.value + "px";
  }

  if (value instanceof StringValue || value instanceof NumberValue) {
    return ("" + value.value).trim();
  } else {
    invariant(false, "TODO");
  }
}

function createMarkupForStyles(realm: Realm, styles: Value): Value {
  let serialized = [];
  let delimiter = "";

  if (styles instanceof ObjectValue && !styles.isPartialObject()) {
    for (let [styleName, binding] of styles.properties) {
      if (binding.descriptor !== undefined) {
        let isCustomProperty = styleName.indexOf("--") === 0;
        let styleValue = getProperty(realm, styles, styleName);

        if (styleValue !== realm.intrinsics.null && styleValue !== realm.intrinsics.undefined) {
          serialized.push(delimiter + hyphenateStyleName(styleName) + ":");
          serialized.push(dangerousStyleValue(realm, styleName, styleValue, isCustomProperty));
          delimiter = ";";
        }
      }
    }
  }
  if (serialized.length > 0) {
    return renderReactNode(realm, serialized);
  }
  return realm.intrinsics.null;
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
          propValue = createMarkupForStyles(realm, propValue);
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

function renderArrayHelper(array) {
  let length = array.length;
  let i = 0;
  let str = "";

  while (i++ < length) {
    str += array[i];
  }
  return str;
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
        newReactNode = [element];
      } else if (typeof newReactNode === "string") {
        newReactNode = [newReactNode, element];
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

function convertValueToNode(value: Value): ReactNode {
  if (value instanceof AbstractValue) {
    return value;
  } else if (value instanceof StringValue || value instanceof NumberValue) {
    return value.value + "";
  }
  invariant(false, "TODO");
}

function renderReactNode(realm: Realm, reactNode: ReactNode): StringValue | AbstractValue {
  let normalizedNode = normalizeNode(realm, reactNode);
  if (typeof normalizedNode === "string") {
    return new StringValue(realm, normalizedNode);
  } else if (normalizedNode instanceof AbstractValue) {
    return normalizedNode;
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
  let val = AbstractValue.createFromBuildFunction(realm, StringValue, args, valueNodes =>
    t.templateLiteral(((quasis: any): Array<any>), valueNodes)
  );
  invariant(val instanceof AbstractValue);
  return val;
}

function createHtmlEscapeHelper(realm: Realm) {
  let escapeHelperAst = parseExpression(escapeHtml.toString(), { plugins: ["flow"] });
  let helper = new ECMAScriptSourceFunctionValue(realm);
  let body = escapeHelperAst.body;
  ((body: any): FunctionBodyAstNode).uniqueOrderedTag = realm.functionBodyUniqueTagSeed++;
  helper.$ECMAScriptCode = body;
  helper.$FormalParameters = escapeHelperAst.params;
  return helper;
}

function createArrayHelper(realm: Realm) {
  let escapeHelperAst = parseExpression(arrayHelper.toString(), { plugins: ["flow"] });
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
    this.arrayHelper = createArrayHelper(realm);
  }
  realm: Realm;
  makeStaticMarkup: boolean;
  previousWasTextNode: boolean;
  htmlEscapeHelper: ECMAScriptSourceFunctionValue;
  arrayHelper: ECMAScriptSourceFunctionValue;

  render(value: Value, namespace: string = "html", depth: number = 0): StringValue | AbstractValue {
    let rootReactNode = this._renderValue(value, namespace, depth);
    return renderReactNode(this.realm, rootReactNode);
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
      return renderValueWithHelper(this.realm, value, this.htmlEscapeHelper);
    }
  }

  _renderArrayValue(value: ArrayValue, namespace: string, depth: number): Array<ReactNode> | ReactNode {
    if (ArrayValue.isIntrinsicAndHasWidenedNumericProperty(value)) {
      let arrayHint = this.realm.react.arrayHints.get(value);

      if (arrayHint !== undefined) {
        return renderValueWithHelper(this.realm, value, this.arrayHelper);
      }
    }
    let elements = [];
    forEachArrayValue(this.realm, value, elementValue => {
      let renderedElement = this._renderValue(elementValue, namespace, depth);
      if (Array.isArray(renderedElement)) {
        elements.push(...renderedElement);
      } else {
        elements.push(renderedElement);
      }
    });
    // $FlowFixMe: flow gets confused here
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
        this.previousWasTextNode = false;
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
    } else if (value instanceof BooleanValue || value instanceof UndefinedValue || value instanceof NullValue) {
      return "";
    }
    invariant(false, "TODO");
  }
}

function handleNestedOptimizedFunctions(realm: Realm, reconciler: Reconciler, staticMarkup: boolean): void {
  for (let { func, evaluatedNode, componentType, context, branchState } of reconciler.nestedOptimizedClosures) {
    if (reconciler.hasEvaluatedNestedClosure(func)) {
      continue;
    }
    if (func instanceof ECMAScriptSourceFunctionValue && reconciler.hasEvaluatedRootNode(func, evaluatedNode)) {
      continue;
    }
    let closureEffects = reconciler.renderNestedOptimizedClosure(
      func,
      [],
      componentType,
      context,
      branchState,
      evaluatedNode
    );

    let closureEffectsRenderedToString = realm.evaluateForEffectsWithPriorEffects(
      [closureEffects],
      () => {
        let serverRenderer = new ReactDOMServerRenderer(realm, staticMarkup);
        invariant(closureEffects.result instanceof Value);
        return serverRenderer.render(closureEffects.result);
      },
      "handleNestedOptimizedFunctions"
    );

    realm.react.optimizedNestedClosuresToWrite.push({
      effects: closureEffectsRenderedToString,
      func,
    });
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

  invariant(realm.generator);
  // create a single regex used for the escape functions
  // by hoisting it, it gets cached by the VM JITs
  realm.generator.emitStatement([], () =>
    t.variableDeclaration("var", [t.variableDeclarator(t.identifier("matchHtmlRegExp"), t.regExpLiteral("[\"'&<>]"))])
  );
  invariant(effects);
  realm.applyEffects(effects);
  invariant(effects.result instanceof Value);
  let serverRenderer = new ReactDOMServerRenderer(realm, staticMarkup);
  let renderValue = serverRenderer.render(effects.result);
  handleNestedOptimizedFunctions(realm, reconciler, staticMarkup);
  return renderValue;
}
