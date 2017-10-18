/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import path from "path";
import type { DebuggerOptions } from "./options";

const TWO_DASH = "--";

export class DebugChannel {
  constructor(fs: any, dbgOptions: DebuggerOptions) {
    this._inFilePath = path.join(__dirname, "../", dbgOptions.inFilePath);
    this._outFilePath = path.join(__dirname, "../", dbgOptions.outFilePath);
    this._fs = fs;
    this._requestReceived = false;
  }
  _inFilePath: string;
  _outFilePath: string;
  _fs: any;
  _requestReceived: boolean;

  /*
  /* Only called in the beginning to check if a debugger is attached
  */
  debuggerIsAttached(): boolean {
    let line = this.readIn();
    if (line === "Debugger Attached\n") {
      this.writeOut("Ready\n");
      return true;
    }
    return false;
  }

  /* Reads in a request from the debug adapter
  /* The caller is responsible for sending a response with the appropriate
  /* contents at the right time.
  /* For now, it returns the request as a string. It will be made to return a
  /* Request object based on the protocol
  */
  readIn(): string {
    let message = "";
    while (true) {
      let contents = this._fs.readFileSync(this._inFilePath, "utf8");

      if (contents.length === 0) {
        continue;
      }
      // format: <length>--<contents>
      let separatorIndex = contents.indexOf(TWO_DASH);
      if (separatorIndex === -1) {
        continue;
      }

      let messageLength = parseInt(contents.slice(0, separatorIndex), 10);
      if (isNaN(messageLength)) {
        continue;
      }

      let startIndex = separatorIndex + TWO_DASH.length;
      let endIndex = separatorIndex + TWO_DASH.length + messageLength;
      message = contents.slice(startIndex, endIndex);
      if (message.length < messageLength) {
        continue;
      }
      break;
    }
    //clear the file
    this._fs.writeFileSync(this._inFilePath, "");
    this._requestReceived = true;
    return message;
  }

  /* Write out a response to the debug adapter
  /* For now, it writes the response as a string. It will be made to return
  /* a Response object based on the protocol
  */
  writeOut(contents: string): void {
    //Prepack only writes back to the debug adapter in response to a request
    if (this._requestReceived) {
      this._fs.writeFileSync(this._outFilePath, contents.length + TWO_DASH + contents);
      this._requestReceived = false;
    }
  }
}
