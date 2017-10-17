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
import { DataHandler } from "./DataHandler.js";

//separator for messages according to the protocol
const TWO_CRLF = "\r\n\r\n";

/* Represents one debugging session in the CLI.
 * Read in user input from the command line, parses the input into commands,
 * sends the commands to the adapter and process any responses
*/
export class UISession {
  constructor(proc: Process, adapterPath: string, prepackCommand: string) {
    this._proc = proc;
    this._adapterPath = adapterPath;
    this._prepackCommand = prepackCommand;
    this._sequenceNum = 0;
    this._invalidCount = 0;
    this._dataHandler = new DataHandler();
  }
  // the parent (i.e. ui) process
  _proc: Process;
  //path to the debug adapter
  _adapterPath: string;
  // the child (i.e. adapter) process
  _adapterProcess: child_process.ChildProcess;

  // id number for each message sent
  _sequenceNum: number;
  // interface to read in input from the CLI client
  _reader: readline.Interface;
  // number of invalid commands
  _invalidCount: number;
  // command to start Prepack with
  _prepackCommand: string;
  // handler for any received messages
  _dataHandler: DataHandler;

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
      //handle the received data
      this._dataHandler.handleData(data, this._processMessage.bind(this));
      //ask the user for the next command
      this._reader.question("(dbg) ", (input: string) => {
        this._dispatch(input);
      });
    });
    this._adapterProcess.stderr.on("data", (data: Buffer) => {
      console.error(data.toString());
      this.shutdown();
    });
  }

  // called from data handler to process a received message
  _processMessage(message: string): void {
    try {
      let msg = JSON.parse(message);
      if (msg.type === "event") {
        this._processEvent(msg);
      } else if (msg.type === "response") {
        this._processResponse(msg);
      }
    } catch (e) {
      console.error(e);
      console.error("Invalid message: " + message.slice(0, 1000));
    }
  }

  _processEvent(event: DebugProtocol.Event) {
    // to be implemented
    console.log(event)
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
    // they can be done from the adapter without user input
    if (command === "init") {
      //format: init <clientID> <adapterID>
      if (parts.length !== 3) return false;
      let args: DebugProtocol.InitializeRequestArguments = {
        // a unique name for each UI (e.g Nuclide, VSCode, CLI)
        clientID: parts[1],
        // a unique name for each adapter
        adapterID: parts[2],
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        supportsVariablePaging: false,
        supportsRunInTerminalRequest: false,
        pathFormat: "path",
      };
      this._sendInitializeRequest(args);
    } else if (command === "configDone") {
      // format: configDone
      if (parts.length !== 1) return false;
      let args: DebugProtocol.ConfigurationDoneArguments = {};
      this._sendConfigDoneRequest(args);
    } else {
      // invalid command
      return false;
    }
    return true;
  }

  // parses the user input into a command and executes it
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
