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

const TWO_DASH = "--";

export class AdapterChannel {
  constructor(inFilePath: string, outFilePath: string) {
    this.inFilePath = inFilePath;
    this.outFilePath = outFilePath;
  }
  inFilePath: string;
  outFilePath: string;

  writeOut(contents: string) {
    fs.writeFileSync(this.outFilePath, contents.length + TWO_DASH + contents);
  }

  listenOnFile(messageProcessor: (err: ?ErrnoError, message?: string) => void) {
    fs.readFile(this.inFilePath, { encoding: "utf8" }, (err: ?ErrnoError, content: string) => {
      if (err) {
        //message processor will disregard the message if there is an error
        messageProcessor(err);
      }
      // format: <length>--<contents>
      let separatorIndex = content.indexOf(TWO_DASH);
      // if the separator is not written in yet, keep listening
      if (separatorIndex === -1) {
        this.listenOnFile(messageProcessor);
        return;
      }
      let messageLength = parseInt(content.slice(0, separatorIndex), 10);
      // if the part before the separator is not a valid length, keep listening
      if (isNaN(messageLength)) {
        this.listenOnFile(messageProcessor);
        return;
      }
      let startIndex = separatorIndex + TWO_DASH.length;
      let endIndex = startIndex + messageLength;
      let message = content.slice(startIndex, endIndex);
      // if we didn't read the whole message yet, keep listening
      if (message.length < messageLength) {
        this.listenOnFile(messageProcessor);
        return;
      }
      //clear the file
      fs.writeFileSync(this.inFilePath, "");
      //process the message
      messageProcessor(null, message);
    });
  }
}
