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
// that it is up-to-date with the current react-dom/server logic and there may also be
// security holes in the string escaping because of this.

import type { Realm } from "../../realm.js";
import { ReactStatistics } from "../../serializer/types.js";
import { SimpleNormalCompletion } from "../../completions.js";
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
} from "../../values/index.js";
import { Reconciler } from "../reconcilation.js";
import {
  applyObjectAssignConfigsForReactElement,
  createReactEvaluatedNode,
  forEachArrayValue,
  getComponentName,
  getProperty,
  getReactSymbol,
  isReactElement,
} from "../utils.js";
import * as t from "@babel/types";
import invariant from "../../invariant.js";
import {
  convertValueToNode,
  createArrayHelper,
  createHtmlEscapeHelper,
  createMarkupForRoot,
  escapeHtml,
  getNonChildrenInnerMarkup,
  quoteAttributeValueForBrowser,
  isCustomComponent,
  normalizeNode,
} from "./utils.js";
import {
  BOOLEAN,
  getPropertyInfo,
  isAttributeNameSafe,
  isUnitlessNumber,
  newlineEatingTags,
  omittedCloseTags,
  OVERLOADED_BOOLEAN,
  RESERVED_PROPS,
  shouldIgnoreAttribute,
  shouldRemoveAttribute,
  STYLE,
} from "./dom-config.js";
// $FlowFixMe: flow complains that this isn't a module but it is, and it seems to load fine
import hyphenateStyleName from "fbjs/lib/hyphenateStyleName";
import { Properties, To } from "../../singletons.js";
import { createOperationDescriptor } from "../../utils/generator.js";

export type ReactNode = Array<ReactNode> | string | AbstractValue | ArrayValue;

function renderValueWithHelper(realm: Realm, value: Value, helper: ECMAScriptSourceFunctionValue): AbstractValue {
  // given we know nothing of this value, we need to escape the contents of it at runtime
  let val = AbstractValue.createFromBuildFunction(
    realm,
    Value,
    [helper, value],
    createOperationDescriptor("REACT_SSR_RENDER_VALUE_HELPER")
  );
  invariant(val instanceof AbstractValue);
  return val;
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

export function createMarkupForCustomAttribute(realm: Realm, name: string, value: Value): ReactNode {
  if (!isAttributeNameSafe(name) || value == null) {
    return "";
  }
  if (value instanceof StringValue || value instanceof NumberValue) {
    return name + "=" + quoteAttributeValueForBrowser(value.value + "");
  } else {
    invariant(false, "TODO");
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
    } else if (value instanceof StringValue || value instanceof NumberValue || value instanceof BooleanValue) {
      // $FlowFixMe: Flow complains about booleans being converted to strings, which is the intention
      return attributeName + "=" + quoteAttributeValueForBrowser(value.value + "");
    } else if (value instanceof AbstractValue) {
      return ([attributeName + "=", renderValueWithHelper(realm, value, htmlEscapeHelper)]: Array<ReactNode>);
    }
  } else if (value instanceof StringValue || value instanceof NumberValue || value instanceof BooleanValue) {
    // $FlowFixMe: Flow complains about booleans being converted to strings, which is the intention
    return name + "=" + quoteAttributeValueForBrowser(value.value + "");
  } else if (value instanceof AbstractValue) {
    return ([name + '="', renderValueWithHelper(realm, value, htmlEscapeHelper), '"']: Array<ReactNode>);
  }
  invariant(false, "TODO");
}

function createMarkupForStyles(realm: Realm, styles: Value): Value {
  let serialized = ([]: Array<ReactNode>);
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
            markup = createMarkupForCustomAttribute(realm, propName, propValue);
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
  let val = AbstractValue.createFromBuildFunction(
    realm,
    StringValue,
    args,
    createOperationDescriptor("REACT_SSR_TEMPLATE_LITERAL", { quasis })
  );
  invariant(val instanceof AbstractValue);
  return val;
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
    let val = this.realm.evaluateWithAbstractConditional(
      condValue,
      () => {
        return this.realm.evaluateForEffects(
          () => this.render(consequentVal, namespace, depth),
          null,
          "_renderAbstractConditionalValue consequent"
        );
      },
      () => {
        return this.realm.evaluateForEffects(
          () => this.render(alternateVal, namespace, depth),
          null,
          "_renderAbstractConditionalValue consequent"
        );
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

  _renderArrayValue(arrayValue: ArrayValue, namespace: string, depth: number): Array<ReactNode> | ReactNode {
    invariant(this.realm.isInPureScope());
    if (ArrayValue.isIntrinsicAndHasWidenedNumericProperty(arrayValue)) {
      let nestedOptimizedFunctionEffects = arrayValue.nestedOptimizedFunctionEffects;

      if (nestedOptimizedFunctionEffects !== undefined) {
        for (let [func, effects] of nestedOptimizedFunctionEffects) {
          let funcCall = () => {
            let result = effects.result;
            this.realm.applyEffects(effects);
            if (result instanceof SimpleNormalCompletion) {
              result = result.value;
            }
            invariant(result instanceof Value);
            return this.render(result, namespace, depth);
          };

          let resolvedEffects;
          resolvedEffects = this.realm.evaluateFunctionForPureEffects(
            func,
            funcCall,
            /*state*/ null,
            `react SSR resolve nested optimized closure`,
            () => {
              invariant(false, "SSR _renderArrayValue side-effect should have been caught in main React reconciler");
            }
          );
          nestedOptimizedFunctionEffects.set(func, resolvedEffects);
          this.realm.collectedNestedOptimizedFunctionEffects.set(func, resolvedEffects);
        }
        return renderValueWithHelper(this.realm, arrayValue, this.arrayHelper);
      }
    }
    let elements = [];
    forEachArrayValue(this.realm, arrayValue, elementValue => {
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
        let defaultValueProp = getProperty(this.realm, propsValue, "defaultValue");
        let defaultCheckedProp = getProperty(this.realm, propsValue, "defaultChecked");
        let valueProp = getProperty(this.realm, propsValue, "value");
        let checkedProp = getProperty(this.realm, propsValue, "checked");

        let newProps = new ObjectValue(this.realm, this.realm.intrinsics.ObjectPrototype);
        Properties.Set(this.realm, newProps, "type", this.realm.intrinsics.undefined, true);

        let inputProps = new ObjectValue(this.realm, this.realm.intrinsics.ObjectPrototype);
        Properties.Set(this.realm, inputProps, "defaultChecked", this.realm.intrinsics.undefined, true);
        Properties.Set(this.realm, inputProps, "defaultValue", this.realm.intrinsics.undefined, true);
        Properties.Set(
          this.realm,
          inputProps,
          "value",
          valueProp !== this.realm.intrinsics.null ? valueProp : defaultValueProp,
          true
        );
        Properties.Set(
          this.realm,
          inputProps,
          "checked",
          checkedProp !== this.realm.intrinsics.null ? checkedProp : defaultCheckedProp,
          true
        );
        applyObjectAssignConfigsForReactElement(this.realm, newProps, [propsValue, inputProps]);
        propsValue = newProps;
      } else if (tag === "textarea") {
        let initialValue = getProperty(this.realm, propsValue, "value");

        if (initialValue === this.realm.intrinsics.null) {
          invariant(false, "TODO");
        }

        let newProps = new ObjectValue(this.realm, this.realm.intrinsics.ObjectPrototype);
        let textareaProps = new ObjectValue(this.realm, this.realm.intrinsics.ObjectPrototype);
        Properties.Set(this.realm, textareaProps, "value", this.realm.intrinsics.undefined, true);
        Properties.Set(this.realm, textareaProps, "children", initialValue, true);
        applyObjectAssignConfigsForReactElement(this.realm, newProps, [propsValue, textareaProps]);
        propsValue = newProps;
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

export function renderToString(
  realm: Realm,
  reactElement: ObjectValue,
  staticMarkup: boolean
): StringValue | AbstractValue {
  let reactStatistics = new ReactStatistics();
  let alreadyEvaluated = new Map();
  let reconciler = new Reconciler(
    realm,
    { firstRenderOnly: true, isRoot: true, modelString: undefined },
    alreadyEvaluated,
    reactStatistics
  );
  let typeValue = getProperty(realm, reactElement, "type");
  let propsValue = getProperty(realm, reactElement, "props");
  let evaluatedRootNode = createReactEvaluatedNode("ROOT", getComponentName(realm, typeValue));
  invariant(typeValue instanceof ECMAScriptSourceFunctionValue);
  if (propsValue instanceof AbstractValue && !(propsValue instanceof AbstractObjectValue)) {
    propsValue = To.ToObject(realm, propsValue);
  }
  invariant(propsValue instanceof ObjectValue || propsValue instanceof AbstractObjectValue);
  let effects = reconciler.resolveReactComponentTree(typeValue, propsValue, null, evaluatedRootNode);

  invariant(realm.generator);
  // create a single regex used for the escape functions
  // by hoisting it, it gets cached by the VM JITs
  realm.generator.emitStatement([], createOperationDescriptor("REACT_SSR_REGEX_CONSTANT"));
  invariant(realm.generator);
  realm.generator.emitStatement([], createOperationDescriptor("REACT_SSR_PREV_TEXT_NODE"));
  invariant(effects);
  realm.applyEffects(effects);
  invariant(effects.result instanceof SimpleNormalCompletion);
  let serverRenderer = new ReactDOMServerRenderer(realm, staticMarkup);
  let renderValue = serverRenderer.render(effects.result.value);
  return renderValue;
}
