/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

//separator for messages according to the protocol
const TWO_CRLF = "\r\n\r\n";

export class DataHandler {
  constructor() {
    this._rawData = new Buffer(0);
    this._contentLength = -1;
  }
  _rawData: Buffer;
  _contentLength: number;

  handleData(data: Buffer, messageProcessor: (message: string) => void): void {
    this._rawData = Buffer.concat([this._rawData, data]);
    // the following code parses a message according to the protocol.
    while (this._rawData.length > 0) {
      // if we know what length we are expecting
      if (this._contentLength >= 0) {
        // we have enough data to check for the expected message
        if (this._rawData.length >= this._contentLength) {
          // first get the expected message
          let message = this._rawData.toString("utf8", 0, this._contentLength);
          // reduce the buffer by the message we got
          this._rawData = this._rawData.slice(this._contentLength);
          // reset the content length to ensure it is extracted for the next message
          this._contentLength = -1;
          // process the message
          messageProcessor(message);
          continue; // there may be more complete messages to process
        }
      } else {
        // if we don't know the length to expect, we need to extract it first
        let idx = this._rawData.indexOf(TWO_CRLF);
        if (idx !== -1) {
          let header = this._rawData.toString("utf8", 0, idx);
          let lines = header.split("\r\n");
          for (let i = 0; i < lines.length; i++) {
            let pair = lines[i].split(/: +/);
            if (pair[0] === "Content-Length") {
              this._contentLength = +pair[1];
            }
          }
          this._rawData = this._rawData.slice(idx + TWO_CRLF.length);
          continue;
        }
        // if we don't find the length we fall through and break
      }
      break;
    }
  }
}
