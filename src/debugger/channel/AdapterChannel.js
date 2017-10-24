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
import type { DebuggerOptions } from "./../../options.js";
import { FileIOWrapper } from "./FileIOWrapper.js";

//Channel used by the debug adapter to communicate with Prepack
export class AdapterChannel {
  constructor(dbgOptions: DebuggerOptions) {
    this._ioWrapper = new FileIOWrapper(true, fs, dbgOptions.inFilePath, dbgOptions.outFilePath);
  }
  _ioWrapper: FileIOWrapper;

  writeOut(contents: string) {
    this._ioWrapper.writeOutSync(contents);
  }

  listenOnFile(errorHandler: (err: ?ErrnoError) => void, messageProcessor: (message: string) => void) {
    this._ioWrapper.readIn(errorHandler, messageProcessor);
  }

  clean() {
    this._ioWrapper.clearInFile();
    this._ioWrapper.clearOutFile();
  }
}
