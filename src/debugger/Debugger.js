/* @flow */
import type { BabelNode } from "babel-types";
import { Breakpoint } from "./Breakpoint.js";
import { ExecutionContext } from "../realm.js";
import invariant from "../invariant.js";
const fs  = require('fs');

export class Debugger {
  constructor(dbgFileLines: Array<string>) {
    this.breakpoints = new Map();
    this.prevBreakLine = 0;
    this.prevBreakCol = 0;
    this.parseCommands(dbgFileLines);
  }
  breakpoints: Map<number, Breakpoint>;
  prevBreakLine: number;
  prevBreakCol: number;

  serializeContext(context: ExecutionContext) {
    return context.loc;
  }

  checkForActions(ast: BabelNode, contextStack: Array<ExecutionContext>) {
    this.checkForBreakpoint(ast, contextStack);
  }

  proceedBreakpoint(lineNum: number, colNum: number): boolean {
    if(this.breakpoints.has(lineNum) && this.breakpoints.get(lineNum).enabled) {
      if (lineNum === this.prevBreakLine) {
        if (colNum === this.prevBreakCol) {
          this.prevBreakCol = 0;
        }
        else {
          this.prevBreakCol = colNum;
        }
        return false;
      }
      this.prevBreakLine = lineNum;
      return true
    }
    return false;
  }

  checkForBreakpoint(ast: BabelNode, contextStack: Array<ExecutionContext>) {
    invariant(ast.loc);
    let location = ast.loc;
    if (location.start.line === location.end.line) {
      let lineNum = location.start.line;
      let colNum = location.start.column;
      if (!this.proceedBreakpoint(lineNum, colNum)) return;

      console.log("Stopped for breakpoint on line " + lineNum);
      this.sendDebugInfo(ast, contextStack, lineNum);

      var lastPoll = Date.now();
      var blocking = true;
      var contents = "";
      while (blocking){
        if(Date.now()-lastPoll > 1000) {
          contents = fs.readFileSync("./src/debugger/.sessionlogs/proxy2debugger.txt", 'utf8').toString().split("\n");
          if(contents[0] === "proceed "+lineNum){
            blocking = false;
          }
          else {
            this.parseCommands(contents);
          }
          lastPoll = Date.now();
        }
      }
      fs.writeFileSync("./src/debugger/.sessionlogs/proxy2debugger.txt","");
    }
  }

  sendDebugInfo(ast: BabelNode, contextStack: Array<ExecutionContext>, lineNum: number) {
    fs.writeFileSync("./src/debugger/.sessionlogs/debugger2proxy.txt", "breakpoint " + lineNum);
    for (let i = 0; i < contextStack.length; i++) {
      let ctxt = contextStack[i];
    }
  }

  parseCommands(commands: Array<string>) {
    for (let i = 0; i < commands.length; i++) {
      let com = commands[i];
      if (com.length === 0) {
        return;
      }
      let parts = com.split(" ");
      if (parts[0] === "breakpoint") {
        this.parseBreakpointCommand(parts);
      }
    }
  }

  parseBreakpointCommand(parts: Array<string>) {
    if (parts[1] === "add") {
      let lineNum = parseInt(parts[2]);
      let breakpoint = new Breakpoint(lineNum, true);
      this.breakpoints.set(lineNum, breakpoint);
    }
    else if (parts[1] === "remove") {
      let lineNum = parseInt(parts[2]);
      invariant(this.breakpoints.has(lineNum));
      this.breakpoints.delete(lineNum);
    }
    else if (parts[1] === "enable") {
      let lineNum = parseInt(parts[2]);
      invariant(this.breakpoints.has(lineNum) && !this.breakpoints.get(lineNum).enabled);
      this.breakpoints.get(lineNum).enabled = true;
    }
    else if (parts[1] === "disable") {
      let lineNum = parseInt(parts[2]);
      invariant(this.breakpoints.has(lineNum) && this.breakpoints.get(lineNum).enabled);
      this.breakpoints.get(lineNum).enabled = false;
    }
  }
}
