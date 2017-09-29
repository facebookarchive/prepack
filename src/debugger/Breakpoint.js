/* @flow */

export class Breakpoint {
  constructor(line: number, virtual: boolean = false, enabled: boolean = true) {
    this.line = line;
    this.virtual = virtual;
    this.enabled = enabled;
  }
  line: number;
  virtual: boolean;
  enabled: boolean;
}
