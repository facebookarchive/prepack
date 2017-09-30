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
