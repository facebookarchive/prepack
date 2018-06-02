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
import { DebuggerConstants } from "./../common/DebuggerConstants";
import type { LaunchRequestArguments } from "./../common/types.js";

export type DebuggerCLIArguments = {
  adapterPath: string,
  prepackRuntime: string,
  sourceFile: string,
  prepackArguments: Array<string>,
};

//separator for messages according to the protocol
const TWO_CRLF = "\r\n\r\n";

/* Represents one debugging session in the CLI.
 * Read in user input from the command line, parses the input into commands,
 * sends the commands to the adapter and process any responses
*/
export class UISession {
  constructor(proc: Process, args: DebuggerCLIArguments) {
    this._proc = proc;
    this._adapterPath = args.adapterPath;
    this._prepackRuntime = args.prepackRuntime;
    this._sourceFile = args.sourceFile;
    this._prepackArguments = args.prepackArguments;
    this._sequenceNum = 1;
    this._invalidCount = 0;
    this._dataHandler = new DataHandler();
    this._prepackWaiting = false;
    this._prepackLaunched = false;
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
  // Prepack runtime command (e.g. lib/prepack-cli.js)
  _prepackRuntime: string;
  // input source file to Prepack
  _sourceFile: string;
  // arguments to start Prepack with
  _prepackArguments: Array<string>;
  // handler for any received messages
  _dataHandler: DataHandler;
  // flag whether Prepack is waiting for a command
  _prepackWaiting: boolean;
  // flag whether Prepack has been launched
  _prepackLaunched: boolean;

  _startAdapter() {
    let adapterArgs = [this._adapterPath];
    this._adapterProcess = child_process.spawn("node", adapterArgs);
    this._proc.on("exit", () => {
      this.shutdown();
    });
    this._proc.on("SIGINT", () => {
      this.shutdown();
    });
    this._adapterProcess.stdout.on("data", (data: Buffer) => {
      //handle the received data
      this._dataHandler.handleData(data, this._processMessage.bind(this));
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
    //ask the user for the next command
    if (this._prepackLaunched && this._prepackWaiting) {
      this._reader.question("(dbg) ", (input: string) => {
        this._dispatch(input);
      });
    }
  }

  _processEvent(event: DebugProtocol.Event) {
    if (event.event === "initialized") {
      // the adapter is ready to accept any persisted debug information
      // (e.g. persisted breakpoints from previous sessions). the CLI
      // does not have any persisted info, so we can send configDone immediately
      let configDoneArgs: DebugProtocol.ConfigurationDoneArguments = {};
      this._sendConfigDoneRequest(configDoneArgs);
    } else if (event.event === "output") {
      this._uiOutput("Prepack output:\n" + event.body.output);
    } else if (event.event === "terminated") {
      this._uiOutput("Prepack exited! Shutting down...");
      this.shutdown();
    } else if (event.event === "stopped") {
      this._prepackWaiting = true;
      if (event.body) {
        this._uiOutput(event.body.reason);
      }
    }
  }

  _processResponse(response: DebugProtocol.Response) {
    if (response.command === "initialize") {
      this._processInitializeResponse(((response: any): DebugProtocol.InitializeResponse));
    } else if (response.command === "launch") {
      this._processLaunchResponse(((response: any): DebugProtocol.LaunchResponse));
    } else if (response.command === "threads") {
      this._processThreadsResponse(((response: any): DebugProtocol.ThreadsResponse));
    } else if (response.command === "stackTrace") {
      //flow doesn't have type refinement for interfaces, so must do a cast here
      this._processStackTraceResponse(((response: any): DebugProtocol.StackTraceResponse));
    } else if (response.command === "scopes") {
      this._processScopesResponse(((response: any): DebugProtocol.ScopesResponse));
    } else if (response.command === "variables") {
      this._processVariablesResponse(((response: any): DebugProtocol.VariablesResponse));
    } else if (response.command === "evaluate") {
      this._processEvaluateResponse(((response: any): DebugProtocol.EvaluateResponse));
    }
  }

  _processScopesResponse(response: DebugProtocol.ScopesResponse) {
    let scopes = response.body.scopes;
    for (const scope of scopes) {
      this._uiOutput(`${scope.name} ${scope.variablesReference}`);
    }
  }

  _processInitializeResponse(response: DebugProtocol.InitializeResponse) {
    let launchArgs: LaunchRequestArguments = {
      prepackRuntime: this._prepackRuntime,
      sourceFile: this._sourceFile,
      prepackArguments: this._prepackArguments,
    };
    this._sendLaunchRequest(launchArgs);
  }

  _processLaunchResponse(response: DebugProtocol.LaunchResponse) {
    this._uiOutput("Prepack is ready");
    this._prepackLaunched = true;
    this._prepackWaiting = true;
    // start reading requests from the user
    this._reader.question("(dbg) ", (input: string) => {
      this._dispatch(input);
    });
  }

  _processStackTraceResponse(response: DebugProtocol.StackTraceResponse) {
    let frames = response.body.stackFrames;
    for (const frame of frames) {
      if (frame.source && frame.source.path) {
        this._uiOutput(`${frame.id}: ${frame.name} ${frame.source.path} ${frame.line}:${frame.column}`);
      } else {
        this._uiOutput(`${frame.id}: ${frame.name} unknown source`);
      }
    }
  }

  _processThreadsResponse(response: DebugProtocol.ThreadsResponse) {
    for (const thread of response.body.threads) {
      this._uiOutput(`${thread.id}: ${thread.name}`);
    }
  }

  _processVariablesResponse(response: DebugProtocol.VariablesResponse) {
    for (const variable of response.body.variables) {
      if (variable.variablesReference === 0) {
        // 0 means there are not more nested variables to return
        this._uiOutput(`${variable.name}: ${variable.value}`);
      } else {
        this._uiOutput(`${variable.name}: ${variable.value} ${variable.variablesReference}`);
      }
    }
  }

  _processEvaluateResponse(response: DebugProtocol.EvaluateResponse) {
    let evalInfo = response.body;
    this._uiOutput("Type: " + (evalInfo.type || "unknown"));
    this._uiOutput(evalInfo.result);
    this._uiOutput("Variables Reference: " + evalInfo.variablesReference);
  }

  // execute a command if it is valid
  // returns whether the command was valid
  _executeCommand(input: string): boolean {
    let parts = input.split(" ");
    let command = parts[0];

    // for testing purposes, init and configDone are made into user commands
    // they can be done from the adapter without user input

    switch (command) {
      case "run":
        // format: run
        if (parts.length !== 1) return false;
        let continueArgs: DebugProtocol.ContinueArguments = {
          // Prepack will only have 1 thread, this argument will be ignored
          threadId: DebuggerConstants.PREPACK_THREAD_ID,
        };
        this._sendContinueRequest(continueArgs);
        break;
      case "breakpoint":
        // format: breakpoint [add | remove | enable | disable] <filePath> <line> ?<column>
        if (parts.length !== 4 && parts.length !== 5) return false;
        if (parts[1] === "add") {
          let filePath = parts[2];
          let line = parseInt(parts[3], 10);
          if (isNaN(line)) return false;
          let column = 0;
          if (parts.length === 5) {
            column = parseInt(parts[4], 10);
            if (isNaN(column)) return false;
          }
          this._sendBreakpointRequest(filePath, line, column);
        }
        break;
      case "stackframes":
        // format: stackFrames
        let stackFrameArgs: DebugProtocol.StackTraceArguments = {
          // Prepack will only have 1 thread, this argument will be ignored
          threadId: DebuggerConstants.PREPACK_THREAD_ID,
        };
        this._sendStackFramesRequest(stackFrameArgs);
        break;
      case "threads":
        if (parts.length !== 1) return false;
        this._sendThreadsRequest();
        break;
      case "scopes":
        if (parts.length !== 2) return false;
        let frameId = parseInt(parts[1], 10);
        if (isNaN(frameId)) return false;
        let scopesArgs: DebugProtocol.ScopesArguments = {
          frameId: frameId,
        };
        this._sendScopesRequest(scopesArgs);
        break;
      case "variables":
        if (parts.length !== 2) return false;
        let varRef = parseInt(parts[1], 10);
        if (isNaN(varRef)) return false;
        let variableArgs: DebugProtocol.VariablesArguments = {
          variablesReference: varRef,
        };
        this._sendVariablesRequest(variableArgs);
        break;
      case "stepInto":
        if (parts.length !== 1) return false;
        let stepIntoArgs: DebugProtocol.StepInArguments = {
          threadId: DebuggerConstants.PREPACK_THREAD_ID,
        };
        this._sendStepIntoRequest(stepIntoArgs);
        break;
      case "stepOver":
        if (parts.length !== 1) return false;
        let stepOverArgs: DebugProtocol.NextArguments = {
          threadId: DebuggerConstants.PREPACK_THREAD_ID,
        };
        this._sendStepOverRequest(stepOverArgs);
        break;
      case "eval":
        if (parts.length < 2) return false;
        let evalFrameId = parseInt(parts[1], 10);
        if (isNaN(evalFrameId)) {
          let expression = parts.slice(1).join(" ");
          let evaluateArgs: DebugProtocol.EvaluateArguments = {
            expression: expression,
          };
          this._sendEvaluateRequest(evaluateArgs);
        } else {
          let expression = parts.slice(2).join(" ");
          let evaluateArgs: DebugProtocol.EvaluateArguments = {
            expression: expression,
            frameId: evalFrameId,
          };
          this._sendEvaluateRequest(evaluateArgs);
        }
        break;
      default:
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
        console.error("Too many invalid commands, shutting down...");
        this.shutdown();
      }
      console.error("Invalid command: " + input);
      this._reader.question("(dbg) ", (line: string) => {
        this._dispatch(line);
      });
    }
    //reset the invalid command counter
    this._invalidCount = 0;
  }

  // tell the adapter about some configuration details
  _sendInitializeRequest(args: DebugProtocol.InitializeRequestArguments) {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "initialize",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  // tell the adapter to start Prepack
  _sendLaunchRequest(args: DebugProtocol.LaunchRequestArguments) {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "launch",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  // tell the adapter that configuration is done so it can expect other commands
  _sendConfigDoneRequest(args: DebugProtocol.ConfigurationDoneArguments) {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "configurationDone",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  // tell the adapter to continue running Prepack
  _sendContinueRequest(args: DebugProtocol.ContinueArguments) {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "continue",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
    this._prepackWaiting = false;
  }

  _sendBreakpointRequest(filePath: string, line: number, column: number = 0) {
    let source: DebugProtocol.Source = {
      path: filePath,
    };
    let breakpoint: DebugProtocol.SourceBreakpoint = {
      line: line,
      column: column,
    };
    let args: DebugProtocol.SetBreakpointsArguments = {
      source: source,
      breakpoints: [breakpoint],
    };
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "setBreakpoints",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  _sendStackFramesRequest(args: DebugProtocol.StackTraceArguments) {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "stackTrace",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  _sendThreadsRequest() {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "threads",
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  _sendScopesRequest(args: DebugProtocol.ScopesArguments) {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "scopes",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  _sendVariablesRequest(args: DebugProtocol.VariablesArguments) {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "variables",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  _sendStepIntoRequest(args: DebugProtocol.StepInArguments) {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "stepIn",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  _sendStepOverRequest(args: DebugProtocol.NextArguments) {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "next",
      arguments: args,
    };
    let json = JSON.stringify(message);
    this._packageAndSend(json);
  }

  _sendEvaluateRequest(args: DebugProtocol.EvaluateArguments) {
    let message = {
      type: "request",
      seq: this._sequenceNum,
      command: "evaluate",
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
    this._sequenceNum++;
  }

  _uiOutput(message: string) {
    console.log(message);
  }

  serve() {
    this._uiOutput("Debugger is starting up Prepack...");
    // Set up the adapter connection
    this._startAdapter();

    // send an initialize request to the adapter to fetch some configuration details
    let initArgs: DebugProtocol.InitializeRequestArguments = {
      // a unique name for each UI (e.g Nuclide, VSCode, CLI)
      clientID: DebuggerConstants.CLI_CLIENTID,
      // a unique name for each adapter
      adapterID: "Prepack-Debugger-Adapter",
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: false,
      supportsRunInTerminalRequest: false,
      pathFormat: "path",
    };
    this._sendInitializeRequest(initArgs);

    this._reader = readline.createInterface({ input: this._proc.stdin, output: this._proc.stdout });
  }

  shutdown() {
    this._reader.close();
    this._adapterProcess.kill();
    this._proc.exit(0);
  }
}
