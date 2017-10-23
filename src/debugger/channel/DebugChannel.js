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
import invariant from "./../../invariant.js";
import type { DebuggerOptions } from "./../../options";
import { MessagePackager } from "./MessagePackager.js";
import { DebugMessage } from "./DebugMessage.js";

//Channel used by the DebugServer in Prepack to communicate with the debug adapter
export class DebugChannel {
  constructor(fs: any, dbgOptions: DebuggerOptions) {
    this._inFilePath = path.join(__dirname, "../../../", dbgOptions.inFilePath);
    this._outFilePath = path.join(__dirname, "../../../", dbgOptions.outFilePath);
    this._fs = fs;
    this._requestReceived = false;
    this._packager = new MessagePackager(false);
  }

  _inFilePath: string;
  _outFilePath: string;
  _fs: any;
  _requestReceived: boolean;
  // helper to package sent messages and unpackage received messages
  _packager: MessagePackager;

  /*
  /* Only called in the beginning to check if a debugger is attached
  */
  debuggerIsAttached(): boolean {
    // Don't use readIn here because we don't want to block if there is no debugger
    let contents = this._fs.readFileSync(this._inFilePath, "utf8");
    let message = this._packager.unpackage(contents);
    if (message === DebugMessage.DEBUGGER_ATTACHED) {
      this._requestReceived = true;
      this._fs.writeFileSync(this._inFilePath, "");
      this.writeOut(DebugMessage.PREPACK_READY);
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
    let message: null | string = null;
    while (true) {
      let contents = this._fs.readFileSync(this._inFilePath, "utf8");
      message = this._packager.unpackage(contents);
      if (message === null) continue;
      break;
    }
    // loop should not break when message is still null
    invariant(message !== null);
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
      this._fs.writeFileSync(this._outFilePath, this._packager.package(contents));
      this._requestReceived = false;
    }
  }
}
