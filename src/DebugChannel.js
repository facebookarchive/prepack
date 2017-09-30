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
    let configFilePath = dbgOptions.configFilePath;
    let config = JSON.parse(fs.readFileSync(configFilePath, "utf8").toString());
    this.inFilePath = path.join(__dirname, "../", config.files.proxy2debugger);
    this.outFilePath = path.join(__dirname, "../", config.files.debugger2proxy);
    this.fs = fs;
  }
  inFilePath: string;
  outFilePath: string;
  fs: any;

  readIn(): string {
    let contents = this.fs.readFileSync(this.inFilePath, "utf8");
    return contents;
  }

  writeOut(contents: string): void {
    this.fs.writeFileSync(this.outFilePath, contents);
  }
}
