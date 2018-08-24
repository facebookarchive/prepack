/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

const path = require("path");
const cluster = require("cluster");
const os = require("os");
const chalk = require("chalk");
const sqlite3 = require("sqlite3");

const db = new sqlite3.Database(path.resolve(__dirname, "..", "overnight.sqlite"));

if (cluster.isMaster) {
  console.log(`Master ${chalk.cyan(process.pid)} started`);

  db.run(
    `create table fuzz_error (
      seed text,
      code text,
      expected_error bool,
      expected text,
      actual_error bool,
      actual text
    )`,
    error => {
      if (error) throw error;
      db.close();
      masterMain();
    }
  );

  function masterMain() {
    const aliveWorkers = new Map();

    // Fork workers.
    const cpus = os.cpus().length;
    for (let i = 0; i < cpus; i++) {
      forkWorker();
    }

    // Restart workers when they die.
    cluster.on("exit", (worker, code, signal) => {
      const pid = chalk.cyan(worker.process.pid);
      const error = chalk.red(signal || code);
      console.log(`Worker ${pid} died (${error}). Restarting...`);
      forkWorker();
    });

    // Creates a new worker
    function forkWorker() {
      const worker = cluster.fork();
      markWorkerAlive(worker);

      worker.on("message", message => {
        if (worker.isDead()) return;
        if (message === "ping") markWorkerAlive(worker);
      });
    }

    // Marks a worker as alive. We kill workers after 10 minutes of inactivity
    // since the worker might be stuck in an infinite loop. Or might be trying
    // to shrink a really large test case.
    function markWorkerAlive(worker) {
      // Clear the old timeout
      if (aliveWorkers.has(worker)) {
        clearTimeout(aliveWorkers.get(worker));
      }
      // Create a new timeout
      const timeoutId = setTimeout(() => {
        const pid = chalk.cyan(worker.process.pid);
        console.log(`Haven’t heard from worker ${pid} in 10 minutes. Killing...`);
        // Hard kill since we suspect the process is in an infinite loop so the
        // process can’t receive an IPC message.
        process.kill(worker.process.pid, "SIGKILL");
        aliveWorkers.delete(worker);
      }, 1000 * 60 * 10);
      aliveWorkers.set(worker, timeoutId);
    }
  }
} else {
  console.log(`Worker ${chalk.cyan(process.pid)} started`);

  // Make the reporter a noop.
  require("./report").reportTestFinish = () => {};

  const { check } = require("testcheck");
  const { executeNormal, executePrepack } = require("./execute");
  const { prepackWorks } = require("./property");

  const insert = db.prepare(`insert into fuzz_error values (?, ?, ?, ?, ?, ?)`);

  loop();

  function loop() {
    process.send("ping");
    const test = check(prepackWorks, { numTests: Infinity, maxSize: 200 });
    process.send("ping");
    console.log(`Worker ${chalk.cyan(process.pid)} found a failing test case`);

    // Add all the failing test cases to the database.
    test.shrunk.smallest.forEach((code, i) => {
      const expected = executeNormal(code);
      const actual = executePrepack(code);
      insert.run(
        test.seed.toString(),
        code,
        expected.error,
        expected.error ? expected.value.stack : JSON.stringify(expected.value),
        actual.error,
        actual.error ? actual.value.stack : JSON.stringify(actual.value),
        error => {
          if (error) throw error;
          loop();
        }
      );
    });
  }
}
