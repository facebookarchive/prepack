/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNode, BabelNodeJSXIdentifier } from "babel-types";
import { Value, ObjectValue, SymbolValue } from "../values/index.js";
import { Get } from "../methods/index.js";

export function isReactElement(val: Value): boolean {
  if (val instanceof ObjectValue && val.properties.has("$$typeof")) {
    let realm = val.$Realm;
    let $$typeof = Get(realm, val, "$$typeof");
    if ($$typeof instanceof SymbolValue) {
      let symbolFromRegistry = realm.globalSymbolRegistry.find(e => e.$Symbol === $$typeof);
      return symbolFromRegistry !== undefined && symbolFromRegistry.$Key === "react.element";
    }
  }
  return false;
}

export function isTagName(ast: BabelNode): boolean {
  return ast.type === "JSXIdentifier" && /^[a-z]|\-/.test(((ast: any): BabelNodeJSXIdentifier).name);
}

export function isReactComponent(name: string) {
  return name.length > 0 && name[0] === name[0].toUpperCase();
}

// we create a unique key for each JSXElement to prevent collisions
// otherwise React will detect a missing/conflicting key at runtime and
// this can break the reconcilation of JSXElements in arrays
export function getUniqueReactElementKey(index?: string, usedReactElementKeys: Set<string>) {
  let key;
  do {
    key = Math.random().toString(36).replace(/[^a-z]+/g, "").substring(0, 2);
  } while (usedReactElementKeys.has(key));
  usedReactElementKeys.add(key);
  if (index !== undefined) {
    return `${key}${index}`;
  }
  return key;
}
