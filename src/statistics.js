/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "./invariant.js";

export class RealmStatistics {
  constructor(getTime: void | (() => number), getMemory: void | (() => number)) {
    this.simplifications = 0;
    this.simplificationAttempts = 0;
    this.evaluatedNodes = 0;

    this.parsing = new PerformanceTracker(getTime, getMemory);
    this.fixupSourceLocations = new PerformanceTracker(getTime, getMemory);
    this.fixupFilenames = new PerformanceTracker(getTime, getMemory);
    this.evaluation = new PerformanceTracker(getTime, getMemory);
  }

  simplifications: number;
  simplificationAttempts: number;
  evaluatedNodes: number;

  // legacy projection
  getRealmStatistics(): any {
    return {
      simplifications: this.simplifications,
      simplificationAttempts: this.simplificationAttempts,
      evaluatedNodes: this.evaluatedNodes,
    };
  }

  parsing: PerformanceTracker;
  fixupSourceLocations: PerformanceTracker;
  fixupFilenames: PerformanceTracker;
  evaluation: PerformanceTracker;

  projectPerformanceTrackers(suffix: string, projection: PerformanceTracker => number): any {
    let res = {};
    for (let key of Object.keys(this)) {
      let value = (this: any)[key];
      if (value instanceof PerformanceTracker) res[key + suffix] = projection(value);
    }
    return res;
  }

  log(): void {
    console.log(`=== realm statistics`);
    console.log(`${this.evaluatedNodes} AST nodes evaluated.`);
    console.log(`${this.simplifications} abstract values simplified after ${this.simplificationAttempts} attempts.`);
  }

  logPerformanceTrackers(format: PerformanceTracker => string): void {
    console.log(
      `${format(this.parsing)} parsing, ${format(this.fixupSourceLocations)} fixing source locations, ${format(
        this.fixupFilenames
      )} fixing filenames, ${format(this.evaluation)} evaluating global code`
    );
  }
}

export class PerformanceTracker {
  time: number;
  memory: number;

  _getTime: void | (() => number);
  _getMemory: void | (() => number);
  _running: boolean;

  constructor(getTime: void | (() => number), getMemory: void | (() => number)) {
    this.time = this.memory = 0;
    this._getTime = getTime;
    this._getMemory = getMemory;
    this._running = false;
  }

  start(): void {
    invariant(this._running === false);
    if (this._getTime !== undefined) this.time = this._getTime() - this.time;
    if (this._getMemory !== undefined) this.memory = this._getMemory() - this.memory;
    this._running = true;
  }

  stop(): void {
    invariant(this._running === true);
    if (this._getTime !== undefined) this.time = this._getTime() - this.time;
    if (this._getMemory !== undefined) this.memory = this._getMemory() - this.memory;
    this._running = false;
  }

  measure<T>(action: () => T): T {
    this.start();
    try {
      return action();
    } finally {
      this.stop();
    }
  }
}
