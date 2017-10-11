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

export class DebugChannel {
  constructor(fs: any, dbgOptions: DebuggerOptions) {
    this.inFilePath = path.join(__dirname, "../", dbgOptions.inFilePath);
    this.outFilePath = path.join(__dirname, "../", dbgOptions.outFilePath);
    this.fs = fs;
    this.requestReceived = false;
  }
  inFilePath: string;
  outFilePath: string;
  fs: any;
  requestReceived: boolean;

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
    let contents = "";
    while (contents.length === 0) {
      contents = this.fs.readFileSync(this.inFilePath, "utf8");
    }
    //clear the file
    this.fs.writeFileSync(this.inFilePath, "");
    this.requestReceived = true;
    return contents;
  }

  /* Write out a response to the debug adapter
  /* For now, it writes the response as a string. It will be made to return
  /* a Response object based on the protocol
  */
  writeOut(contents: string): void {
    //Prepack only writes back to the debug adapter in response to a request
    if (this.requestReceived) {
      this.fs.writeFileSync(this.outFilePath, contents);
      this.requestReceived = false;
    }
  }
}
