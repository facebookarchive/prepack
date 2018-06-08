/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../../realm.js";
import { ObjectValue, AbstractObjectValue } from "../../values/index.js";
import { createAbstract } from "../prepack/utils.js";
import { Properties } from "../../singletons.js";
import invariant from "../../invariant";

const functions = [
  "getElementById",
  "getElementByTag",
  "getElementByClassName",
  "getElementByName",
  "getElementByTagName",
  "getElementByTagNameNS",
  "querySelector",
  "querySelectorAll",
  "createElement",
  "createDocumentFragment",
  "createTextNode",
];

export default function(realm: Realm): AbstractObjectValue {
  // document object
  let document = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "document", false);

  // check if we can use abstracts
  if (realm.useAbstractInterpretation) {
    // common methods on document
    for (let name of functions) {
      let func = createAbstract(realm, "function", `document.${name}`);
      Properties.Set(realm, document, name, func, false);
    }

    // document.body
    let body = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "document.body");
    Properties.Set(realm, document, "body", body, false);

    // make abstract
    let abstractObject = createAbstract(realm, document, "document");
    invariant(abstractObject instanceof AbstractObjectValue);
    return abstractObject;
  }
  return document;
}
