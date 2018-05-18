/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../../realm.js";
import { BooleanValue, FunctionValue, SymbolValue, Value } from "../../values/index.js";

type PropertyType = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type PropertyInfo = {|
  +acceptsBooleans: boolean,
  +attributeName: string,
  +attributeNamespace: string | null,
  +mustUseProperty: boolean,
  +propertyName: string,
  +type: PropertyType,
|};

export const STYLE = "style";
export const RESERVED_PROPS: Set<string> = new Set([
  "children",
  "dangerouslySetInnerHTML",
  "suppressContentEditableWarning",
  "suppressHydrationWarning",
]);
export const omittedCloseTags: Set<string> = new Set([
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
export const newlineEatingTags = {
  listing: true,
  pre: true,
  textarea: true,
};
export const isUnitlessNumber = {
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

function prefixKey(prefix, key) {
  return prefix + key.charAt(0).toUpperCase() + key.substring(1);
}

Object.keys(isUnitlessNumber).forEach(function(prop) {
  prefixes.forEach(function(prefix) {
    isUnitlessNumber[prefixKey(prefix, prop)] = isUnitlessNumber[prop];
  });
});

export const RESERVED = 0;
export const STRING = 1;
export const BOOLEANISH_STRING = 2;
export const BOOLEAN = 3;
export const OVERLOADED_BOOLEAN = 4;
export const NUMERIC = 5;
export const POSITIVE_NUMERIC = 6;

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

export function getPropertyInfo(name: string): PropertyInfo | null {
  return properties.hasOwnProperty(name) ? properties[name] : null;
}

function shouldRemoveAttributeWithWarning(
  name: string,
  value: Value,
  propertyInfo: PropertyInfo | null,
  isCustomComponentTag: boolean
): boolean {
  if (propertyInfo !== null && propertyInfo.type === RESERVED) {
    return false;
  }
  if (value instanceof FunctionValue || value instanceof SymbolValue) {
    return true;
  } else if (value instanceof BooleanValue) {
    if (isCustomComponentTag) {
      return false;
    }
    if (propertyInfo !== null) {
      return !propertyInfo.acceptsBooleans;
    } else {
      const prefix = name.toLowerCase().slice(0, 5);
      return prefix !== "data-" && prefix !== "aria-";
    }
  }
  return false;
}

export function shouldRemoveAttribute(
  realm: Realm,
  name: string,
  value: Value,
  propertyInfo: PropertyInfo | null,
  isCustomComponentTag: boolean
): boolean {
  if (value === realm.intrinsics.null || value === realm.intrinsics.undefined) {
    return true;
  }
  if (shouldRemoveAttributeWithWarning(name, value, propertyInfo, isCustomComponentTag)) {
    return true;
  }
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
