/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

export class Message {
  constructor(command: string) {
    this.command = command;
  }
  command: string;

  prepareToSend(): string {
    let message = {};
    return JSON.stringify(message);
  }
}
