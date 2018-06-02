/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

export class PrepackException {
  constructor(filePath: string, line: number, column: number = 0, temporary: boolean = false, enabled: boolean = true) {
    this.filePath = filePath;
    this.line = line;
    this.temporary = temporary;
    this.enabled = enabled;
    this.column = column;
  }
  filePath: string;
  line: number;
  column: number;

  //real breakpoint set by client or temporary one set by debugger
  temporary: boolean;
  enabled: boolean;
}
