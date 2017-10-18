/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import fs from "fs";

const LENGTH_SEPARATOR = "--";

export class AdapterChannel {
  constructor(inFilePath: string, outFilePath: string) {
    this._inFilePath = inFilePath;
    this._outFilePath = outFilePath;
  }
  _inFilePath: string;
  _outFilePath: string;

  writeOut(contents: string) {
    fs.writeFileSync(this._outFilePath, contents.length + LENGTH_SEPARATOR + contents);
  }

  listenOnFile(errorHandler: (err: ?ErrnoError) => void, messageProcessor: (message?: string) => void) {
    fs.readFile(this._inFilePath, { encoding: "utf8" }, (err: ?ErrnoError, content: string) => {
      if (err) {
        errorHandler(err);
        return;
      }
      // format: <length>--<contents>
      let separatorIndex = content.indexOf(LENGTH_SEPARATOR);
      // if the separator is not written in yet, keep listening
      if (separatorIndex === -1) {
        this.listenOnFile(errorHandler, messageProcessor);
        return;
      }
      let messageLength = parseInt(content.slice(0, separatorIndex), 10);
      // if the part before the separator is not a valid length, keep listening
      if (isNaN(messageLength)) {
        this.listenOnFile(errorHandler, messageProcessor);
        return;
      }
      let startIndex = separatorIndex + LENGTH_SEPARATOR.length;
      let endIndex = startIndex + messageLength;
      let message = content.slice(startIndex, endIndex);
      // if we didn't read the whole message yet, keep listening
      if (message.length < messageLength) {
        this.listenOnFile(errorHandler, messageProcessor);
        return;
      }
      //clear the file
      fs.writeFileSync(this._inFilePath, "");
      //process the message
      messageProcessor(message);
    });
  }
}
