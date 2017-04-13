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
import { NativeFunctionValue, UndefinedValue, StringValue,  NullValue } from "../../values/index.js";
import { ToObjectPartial } from "../../methods/to.js";
import { IsArray } from "../../methods/is.js";
import { Get } from "../../methods/get.js";

export default function (realm: Realm): NativeFunctionValue {
  // ECMA262 22.1.3.30
  return new NativeFunctionValue(realm, "Object.prototype.toString", "toString", 0, (context) => {
  // 1. If the this value is undefined, return "[object Undefined]".
  if (context instanceof UndefinedValue) return new StringValue(realm, "[object Undefined]");

  // 2. If the this value is null, return "[object Null]".
  if (context instanceof NullValue) return new StringValue(realm, "[object Null]");

  // 3. Let O be ToObject(this value).
  let O = ToObjectPartial(realm, context);

  let builtinTag;

  // 4. Let isArray be ? IsArray(O).
  let isArray = IsArray(realm, O);

  // 5. If isArray is true, let builtinTag be "Array".
  if (isArray) builtinTag = "Array";

  // 6. Else, if O is an exotic String object, let builtinTag be "String".
  else if ("$StringData" in O) builtinTag = "String";

  // 7. Else, if O has an [[ParameterMap]] internal slot, let builtinTag be "Arguments".
  else if ("$ParameterMap" in O) builtinTag = "Arguments";

  // 8. Else, if O has a [[Call]] internal method, let builtinTag be "Function".
  else if ("$Call" in O) builtinTag = "Function";

  // 9. Else, if O has an [[ErrorData]] internal slot, let builtinTag be "Error".
  else if ("$ErrorData" in O) builtinTag = "Error";

  // 10. Else, if O has a [[BooleanData]] internal slot, let builtinTag be "Boolean".
  else if ("$BooleanData" in O) builtinTag = "Boolean";

  // 11. Else, if O has a [[NumberData]] internal slot, let builtinTag be "Number".
  else if ("$NumberData" in O) builtinTag = "Number";

  // 12. Else, if O has a [[DateValue]] internal slot, let builtinTag be "Date".
  else if ("$DateValue" in O) builtinTag = "Date";

  // 13. Else, if O has a [[RegExpMatcher]] internal slot, let builtinTag be "RegExp".
  else if ("$RegExpMatcher" in O) builtinTag = "RegExp";

  // 14. Else, let builtinTag be "Object".
  else builtinTag = "Object";

  // 15. Let tag be ? Get(O, @@toStringTag).
  let tag = Get(realm, O, realm.intrinsics.SymbolToStringTag);

  // 16. If Type(tag) is not String, let tag be builtinTag.
  tag = tag instanceof StringValue ? tag.value : builtinTag;

  // 17. Return the String that is the result of concatenating "[object ", tag, and "]".
  return new StringValue(realm, `[object ${tag}]`);
}, false);

}
