/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import typeof fs from "fs";
import path from "path";
import { MessagePackager } from "./MessagePackager.js";
import invariant from "../../invariant.js";

export class FileIOWrapper {
  // fs cannot be imported from anything called directly or indirectly
  // by prepack-standalone so it needs to be passed in here
  constructor(isAdapter: boolean, fileSystem: fs, inFilePath: string, outFilePath: string) {
    // the paths are expected to be relative to Prepack top level directory
    this._fs = fileSystem;
    this._inFilePath = path.join(__dirname, "../../../", inFilePath);
    this._outFilePath = path.join(__dirname, "../../../", outFilePath);
    this._packager = new MessagePackager(isAdapter);
    this._isAdapter = isAdapter;
  }
  _inFilePath: string;
  _outFilePath: string;
  _packager: MessagePackager;
  _isAdapter: boolean;
  _fs: fs;

  // Read in a message from the input asynchronously
  readIn(errorHandler: (err: ?ErrnoError) => void, messageProcessor: (message: string) => void) {
    this._fs.readFile(this._inFilePath, { encoding: "utf8" }, (err: ?ErrnoError, contents: string) => {
      if (err) {
        errorHandler(err);
        return;
      }
      let message = this._packager.unpackage(contents);
      if (message === null) {
        this.readIn(errorHandler, messageProcessor);
        return;
      }
      //clear the file
      this._fs.writeFileSync(this._inFilePath, "");
      //process the message
      messageProcessor(message);
    });
  }

  // Read in a message from the input synchronously
  readInSync(): string {
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
    return message;
  }

  // Read in a message from the input synchronously only once
  readInSyncOnce(): null | string {
    let contents = this._fs.readFileSync(this._inFilePath, "utf8");
    let message = this._packager.unpackage(contents);
    return message;
  }

  // Write out a message to the output synchronously
  writeOutSync(contents: string) {
    this._fs.writeFileSync(this._outFilePath, this._packager.package(contents));
  }

  clearInFile() {
    this._fs.writeFileSync(this._inFilePath, "");
  }

  clearOutFile() {
    this._fs.writeFileSync(this._outFilePath, "");
  }
}
