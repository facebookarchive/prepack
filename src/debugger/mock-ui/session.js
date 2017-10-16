/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import readline from "readline";
import child_process from "child_process";
import * as DebugProtocol from "vscode-debugprotocol";

//separator for messages according to the protocol
const TWO_CRLF = "\r\n\r\n";

export class Session {
  constructor(proc: Process, adapterPath: string, prepackCommand: string) {
    this._proc = proc;
    this._adapterPath = adapterPath;
    this._prepackCommand = prepackCommand;
    this._rawData = new Buffer(0);
    this._contentLength = -1;
    this._sequenceNum = 0;
    this._invalidCount = 0;
  }
  // the parent (i.e. ui) process
  _proc: Process;
  //path to the debug adapter
  _adapterPath: string;
  // the child (i.e. adapter) process
  _adapterProcess: child_process.ChildProcess;

  // buffer to hold incoming data from the adapter
  _rawData: Buffer;
  // expected content length for a message
  _contentLength: number;
  // id number for each message sent
  _sequenceNum: number;
  // interface to read in input from the CLI client
  _reader: readline.Interface;
  // number of invalid commands
  _invalidCount: number;
  // command to start Prepack with
  _prepackCommand: string;

  _startAdapter() {
    let adapterArgs = [this._adapterPath, "--prepack", this._prepackCommand];
    this._adapterProcess = child_process.spawn("node", adapterArgs);
    this._proc.on("exit", () => {
      this.shutdown();
    });
    this._proc.on("SIGINT", () => {
      this.shutdown();
    });
    this._adapterProcess.on("exit", () => {
      this.shutdown();
    });
    this._adapterProcess.stdout.on("data", (data: Buffer) => {
      this._handleData(data);
    });
    this._adapterProcess.stderr.on("data", (data: Buffer) => {
      console.error(data.toString());
      this.shutdown();
    });
  }

  // callback to handle data written back by the adapter
  _handleData(data: Buffer): void {
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
          if (message.length > 0) {
            try {
              let msg = JSON.parse(message);
              if (msg.type === "event") {
                this._processEvent(msg);
              } else if (msg.type === "response") {
                this._processResponse(msg);
              }
            } catch (e) {
              console.log("Invalid message");
            }
          }
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

    //ask the user for the next command
    this._reader.question("(dbg) ", (input: string) => {
      this._dispatch(input);
    });
  }

  _processEvent(event: DebugProtocol.Event) {
    // to be implemented
    console.log(event);
  }

  _processResponse(response: DebugProtocol.Response) {
    // to be implemented
    console.log(response);
  }

  // execute a command if it is valid
  // returns whether the command was valid
  _executeCommand(input: string): boolean {
    let parts = input.split(" ");
    let command = parts[0];

    // for testing purposes, init and configDone are made into user commands
    // they can be done without user input
    if (command === "init") {
      let args: DebugProtocol.InitializeRequestArguments = {
        clientID: "CLI",
        adapterID: "Prepack",
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        supportsVariablePaging: false,
        supportsRunInTerminalRequest: false,
        pathFormat: "path",
      };
      this._sendInitializeRequest(args);
    } else if (command === "configDone") {
      let args: DebugProtocol.ConfigurationDoneArguments = {};
      this._sendConfigDoneRequest(args);
    } else {
      // invalid command
      return false;
    }
    return true;
  }

  // parses the user input into a command and executes it if it is valid
  _dispatch(input: string) {
    if (input === "exit") {
      this.shutdown();
    }
    let success = this._executeCommand(input);
    if (!success) {
      // input was invalid
      this._invalidCount++;
      //prevent stack overflow from recursion
      if (this._invalidCount >= 10) {
        console.log("Too many invalid commands, shutting down...");
        this.shutdown();
      }
      console.log("Invalid command: " + input);
      this._reader.question("(dbg) ", (line: string) => {
        this._dispatch(line);
      });
    }
    //reset the invalid command counter
    this._invalidCount = 0;
  }

  // tell the adapter about some configuration details
  _sendInitializeRequest(args: DebugProtocol.InitializeRequestArguments) {
    this._sequenceNum++;
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "initialize",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  // tell the adapter that configuration is done so it can expect other commands
  _sendConfigDoneRequest(args: DebugProtocol.ConfigurationDoneArguments) {
    this._sequenceNum++;
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "configurationDone",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  // write out a message to the adapter on stdout
  _packageAndSend(message: string) {
    // format: Content-Length: <length> separator <message>
    this._adapterProcess.stdin.write(
      "Content-Length: " + Buffer.byteLength(message, "utf8") + TWO_CRLF + message,
      "utf8"
    );
  }

  serve() {
    // Set up the adapter connection
    this._startAdapter();

    this._reader = readline.createInterface({ input: this._proc.stdin, output: this._proc.stdout });
    // Start taking in commands and execute them
    this._reader.question("(dbg) ", (input: string) => {
      this._dispatch(input);
    });
  }

  shutdown() {
    this._reader.close();
    this._adapterProcess.kill();
    this._proc.exit(0);
  }
}
