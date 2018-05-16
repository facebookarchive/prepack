/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

import invariant from "../invariant.js";

const LENGTH_SEPARATOR = "--";

// Package a message sent or unpackage a message received
export class MessagePackager {
  constructor(isAdapter: boolean) {
    this._isAdapter = isAdapter;
  }
  _isAdapter: boolean;

  // package a message to be sent
  package(contents: string): string {
    // format: <length>--<contents>
    return contents.length + LENGTH_SEPARATOR + contents;
  }

  // unpackage a message received, verify it, and return it
  // returns null if no message or the message is only partially read
  // errors if the message violates the format
  unpackage(contents: string): null | string {
    // format: <length>--<contents>
    let separatorIndex = contents.indexOf(LENGTH_SEPARATOR);
    // if the separator is not written in yet --> partial read
    if (separatorIndex === -1) {
      return null;
    }
    let messageLength = parseInt(contents.slice(0, separatorIndex), 10);
    // if the part before the separator is not a valid length, it is a
    // violation of protocol
    invariant(!isNaN(messageLength));
    let startIndex = separatorIndex + LENGTH_SEPARATOR.length;
    let endIndex = startIndex + messageLength;
    // there should only be one message in the contents at a time
    invariant(contents.length <= startIndex + messageLength);
    // if we didn't read the whole message yet --> partial read
    if (contents.length < endIndex) {
      return null;
    }
    let message = contents.slice(startIndex, endIndex);
    return message;
  }
}
