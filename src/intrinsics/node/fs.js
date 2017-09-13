/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "../../invariant.js";
import type { Realm } from "../../realm.js";
import { AbstractValue, NumberValue, ObjectValue, StringValue } from "../../values/index.js";
import { DefinePropertyOrThrow, ToString, ToNumber } from "../../methods/index.js";
import { ValuesDomain } from "../../domains/index.js";
import buildExpressionTemplate from "../../utils/builder.js";
import { getNodeBufferFromTypedArray } from "./utils.js";

declare var process: any;

export default function(realm: Realm): ObjectValue {
  let intrinsicName = 'process.binding("fs")';
  let nativeFS = process.binding("fs");

  // fs
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, intrinsicName);
  obj.defineNativeMethod("FSInitialize", 0, (context, args) => {
    // TODO: Implement the native implementation.
    return realm.intrinsics.undefined;
  });
  obj.defineNativeMethod("internalModuleStat", 0, (context, args) => {
    const fileName = ToString(realm, args[0]);
    return new NumberValue(realm, nativeFS.internalModuleStat(fileName));
  });
  obj.defineNativeMethod("lstat", 0, (context, args) => {
    const path = ToString(realm, args[0]);
    invariant(args[1] instanceof ObjectValue);
    const buffer = getNodeBufferFromTypedArray(realm, args[1]);
    const float64buffer = new Float64Array(buffer.buffer);
    nativeFS.lstat(path, float64buffer);
    return args[1];
  });
  obj.defineNativeMethod("fstat", 0, (context, args) => {
    const fd = ToNumber(realm, args[0]);
    invariant(args[1] instanceof ObjectValue);
    const buffer = getNodeBufferFromTypedArray(realm, args[1]);
    const float64buffer = new Float64Array(buffer.buffer);
    nativeFS.fstat(fd, float64buffer);
    return args[1];
  });
  obj.defineNativeMethod("open", 0, (context, args) => {
    const path = ToString(realm, args[0]);
    const flags = ToNumber(realm, args[1]);
    const mode = ToNumber(realm, args[2]);
    const fd = nativeFS.open(path, flags, mode);
    return new NumberValue(realm, fd);
  });
  obj.defineNativeMethod("close", 0, (context, args) => {
    const fd = ToNumber(realm, args[0]);
    nativeFS.close(fd);
    return realm.intrinsics.undefined;
  });
  obj.defineNativeMethod("read", 0, (context, args) => {
    const fd = ToNumber(realm, args[0]);
    invariant(args[1] instanceof ObjectValue);
    const buffer = getNodeBufferFromTypedArray(realm, args[1]);
    const offset = ToNumber(realm, args[2]);
    const length = ToNumber(realm, args[3]);
    const position = args[4] === realm.intrinsics.undefined ? undefined : ToNumber(realm, args[4]);
    const bytesRead = nativeFS.read(fd, buffer, offset, length, position);
    return new NumberValue(realm, bytesRead);
  });
  obj.defineNativeMethod("internalModuleReadFile", 0, (context, args) => {
    const path = ToString(realm, args[0]);
    const result = nativeFS.internalModuleReadFile(path);
    if (result === undefined) {
      return realm.intrinsics.undefined;
    }
    return new StringValue(realm, result);
  });

  let FSReqWrapTemplateSrc = `${intrinsicName}.FSReqWrap`;
  let FSReqWrapTemplate = buildExpressionTemplate(FSReqWrapTemplateSrc);
  let val = AbstractValue.createFromTemplate(realm, FSReqWrapTemplate, ObjectValue, [], FSReqWrapTemplateSrc);
  val.values = new ValuesDomain(new Set([new ObjectValue(realm)]));
  val.intrinsicName = FSReqWrapTemplateSrc;
  DefinePropertyOrThrow(realm, obj, "FSReqWrap", {
    value: val,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  // TODO: Implement more of the native methods here. Ideally all of them should
  // just be automatically proxied.

  return obj;
}
