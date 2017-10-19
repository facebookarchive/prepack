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
import { MessagePackager } from "./MessagePackager.js";

//Channel used by the debug adapter to communicate with Prepack
export class AdapterChannel {
  constructor(inFilePath: string, outFilePath: string) {
    this._inFilePath = inFilePath;
    this._outFilePath = outFilePath;
    this._packager = new MessagePackager();
  }
  _inFilePath: string;
  _outFilePath: string;
  // helper to package sent messages and unpackage received messages
  _packager: MessagePackager;

  writeOut(contents: string) {
    fs.writeFileSync(this._outFilePath, this._packager.package(contents));
  }

  listenOnFile(errorHandler: (err: ?ErrnoError) => void, messageProcessor: (message?: string) => void) {
    fs.readFile(this._inFilePath, { encoding: "utf8" }, (err: ?ErrnoError, contents: string) => {
      if (err) {
        errorHandler(err);
        return;
      }
      let message = this._packager.unpackage(contents);
      if (message === null) {
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
