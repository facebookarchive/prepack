/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Message } from "./Message.js";

export class MessageQueue {
  constructor(fs: any, outFilePath: string) {
    this._queue = [];
    this._awaitingResponse = false;

    this._fs = fs;
    this._outFilePath = outFilePath;
  }
  _queue: Array<Message>;
  _awaitingResponse: boolean;
  _fs: any;
  _outFilePath: string;

  enqueue(message: Message) {
    this._queue.push(message);
  }

  dequeue(): Message | void {
    if (this._queue.length === 0) {
      return undefined;
    }
    return this._queue.splice(0, 1)[0];
  }

  /* Send one message in the queue to prepack.
   * Returns whether the message was sent successfully
   * Two cases for unsuccessful send:
   * - Prepack has not yet written back since the last message
   * - There are no messages to send
  */
  sendOne(): boolean {
    if (this._awaitingResponse) {
      return false;
    }
    let message = this.dequeue();
    if (message) {
      this._fs.writeFileSync(this._outFilePath, message.prepareToSend());
      this._awaitingResponse = true;
    }
    return false;
  }

  // The adapter will let the queue know that it received a reply back
  // This way the adapter is not blocked while Prepack is executing
  received() {
    this._awaitingResponse = false;
  }
}
