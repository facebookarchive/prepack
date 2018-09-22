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
import {
  AbstractValue,
  BooleanValue,
  FunctionValue,
  NumberValue,
  StringValue,
  SymbolValue,
  Value,
} from "../../values/index.js";
import invariant from "../../invariant.js";

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
export const ROOT_ATTRIBUTE_NAME = "data-reactroot";
/* eslint-disable max-len */
export const ATTRIBUTE_NAME_START_CHAR =
  ":A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
export const ATTRIBUTE_NAME_CHAR = ATTRIBUTE_NAME_START_CHAR + "\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
export const VALID_ATTRIBUTE_NAME_REGEX = new RegExp(
  "^[" + ATTRIBUTE_NAME_START_CHAR + "][" + ATTRIBUTE_NAME_CHAR + "]*$"
);

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

["contentEditable", "draggable", "spellCheck", "value"].forEach(name => {
  properties[name] = new PropertyInfoRecord(name, BOOLEANISH_STRING, false, name.toLowerCase(), null);
});

["autoReverse", "externalResourcesRequired", "preserveAlpha"].forEach(name => {
  properties[name] = new PropertyInfoRecord(name, BOOLEANISH_STRING, false, name, null);
});

[
  "allowFullScreen",
  "async",
  "autoFocus",
  "autoPlay",
  "controls",
  "default",
  "defer",
  "disabled",
  "formNoValidate",
  "hidden",
  "loop",
  "noModule",
  "noValidate",
  "open",
  "playsInline",
  "readOnly",
  "required",
  "reversed",
  "scoped",
  "seamless",
  "itemScope",
].forEach(name => {
  properties[name] = new PropertyInfoRecord(name, BOOLEAN, false, name.toLowerCase(), null);
});

["checked", "multiple", "muted", "selected"].forEach(name => {
  properties[name] = new PropertyInfoRecord(name, BOOLEAN, true, name.toLowerCase(), null);
});

["capture", "download"].forEach(name => {
  properties[name] = new PropertyInfoRecord(name, OVERLOADED_BOOLEAN, false, name.toLowerCase(), null);
});

["cols", "rows", "size", "span"].forEach(name => {
  properties[name] = new PropertyInfoRecord(name, POSITIVE_NUMERIC, false, name.toLowerCase(), null);
});

["rowSpan", "start"].forEach(name => {
  properties[name] = new PropertyInfoRecord(name, NUMERIC, false, name.toLowerCase(), null);
});

const CAMELIZE = /[\-\:]([a-z])/g;
const capitalize = token => token[1].toUpperCase();

[
  "accent-height",
  "alignment-baseline",
  "arabic-form",
  "baseline-shift",
  "cap-height",
  "clip-path",
  "clip-rule",
  "color-interpolation",
  "color-interpolation-filters",
  "color-profile",
  "color-rendering",
  "dominant-baseline",
  "enable-background",
  "fill-opacity",
  "fill-rule",
  "flood-color",
  "flood-opacity",
  "font-family",
  "font-size",
  "font-size-adjust",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-weight",
  "glyph-name",
  "glyph-orientation-horizontal",
  "glyph-orientation-vertical",
  "horiz-adv-x",
  "horiz-origin-x",
  "image-rendering",
  "letter-spacing",
  "lighting-color",
  "marker-end",
  "marker-mid",
  "marker-start",
  "overline-position",
  "overline-thickness",
  "paint-order",
  "panose-1",
  "pointer-events",
  "rendering-intent",
  "shape-rendering",
  "stop-color",
  "stop-opacity",
  "strikethrough-position",
  "strikethrough-thickness",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "text-decoration",
  "text-rendering",
  "underline-position",
  "underline-thickness",
  "unicode-bidi",
  "unicode-range",
  "units-per-em",
  "v-alphabetic",
  "v-hanging",
  "v-ideographic",
  "v-mathematical",
  "vector-effect",
  "vert-adv-y",
  "vert-origin-x",
  "vert-origin-y",
  "word-spacing",
  "writing-mode",
  "xmlns:xlink",
  "x-height",
].forEach(attributeName => {
  const name = attributeName.replace(CAMELIZE, capitalize);
  properties[name] = new PropertyInfoRecord(name, STRING, false, attributeName, null);
});

["xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type"].forEach(
  attributeName => {
    const name = attributeName.replace(CAMELIZE, capitalize);
    properties[name] = new PropertyInfoRecord(name, STRING, false, attributeName, "http://www.w3.org/1999/xlink");
  }
);

["xml:base", "xml:lang", "xml:space"].forEach(attributeName => {
  const name = attributeName.replace(CAMELIZE, capitalize);
  properties[name] = new PropertyInfoRecord(name, STRING, false, attributeName, "http://www.w3.org/XML/1998/namespace");
});

properties.tabIndex = new PropertyInfoRecord("tabIndex", STRING, false, "tabindex", null);

export function getPropertyInfo(name: string): PropertyInfo | null {
  return properties.hasOwnProperty(name) ? properties[name] : null;
}

const illegalAttributeNameCache = {};
const validatedAttributeNameCache = {};

export function isAttributeNameSafe(attributeName: string): boolean {
  if (validatedAttributeNameCache.hasOwnProperty(attributeName)) {
    return true;
  }
  if (illegalAttributeNameCache.hasOwnProperty(attributeName)) {
    return false;
  }
  if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName)) {
    validatedAttributeNameCache[attributeName] = true;
    return true;
  }
  illegalAttributeNameCache[attributeName] = true;
  return false;
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
  } else if (value instanceof AbstractValue) {
    invariant(false, "TODO");
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
        if (value instanceof BooleanValue) {
          return !value.value;
        }
        return invariant(false, "TODO");
      case OVERLOADED_BOOLEAN:
        if (value instanceof BooleanValue) {
          return value.value === false;
        }
        return invariant(false, "TODO");
      case NUMERIC:
        if (value instanceof NumberValue || value instanceof StringValue) {
          return isNaN(value.value);
        }
        return invariant(false, "TODO");
      case POSITIVE_NUMERIC:
        if (value instanceof NumberValue || value instanceof StringValue) {
          return isNaN(value.value) || (value.value: any) < 1;
        }
        return invariant(false, "TODO");
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
