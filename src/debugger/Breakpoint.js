/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

export class Breakpoint {
  //Will add more fields as needed in the future
  constructor(line: number, virtual: boolean = false, enabled: boolean = true) {
    this.line = line;
    this.virtual = virtual;
    this.enabled = enabled;
  }
  line: number;

  //real breakpoint set by client or virtual one set by debugger
  virtual: boolean;
  enabled: boolean;
}
