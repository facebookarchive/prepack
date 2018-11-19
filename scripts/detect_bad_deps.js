/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import madge from "madge";
import { exec } from "child_process";

const MAX_CYCLE_LEN = 56; // NEVER EVER increase this value

const cmd = "flow check --profile --merge-timeout 0";
exec(cmd, function(error, stdout, stderr) {
  error;
  stdout;
  /*
  pattern format:
  ...
  cycle detected among the following files:
      file1
      file2
      ...
      filen
  ... more flow output after unindented line
  */
  let inCycle = false;
  let cycles = 0;
  let cycle_len = 0,
    max_cycle_len = 0;
  let found_ecma = false,
    found_realm = false;
  let lines = stderr.split("\n");
  for (let line of lines) {
    if (inCycle && !line.startsWith("\t")) {
      if (found_ecma && found_realm) {
        console.error("Invalid Dependencies: ecma262/ is in a circular dependency with realm.js");
        console.error("Run the following command to see the cycle: " + cmd);
        process.exit(1);
      }
      max_cycle_len = Math.max(cycle_len, max_cycle_len);
      cycle_len = 0;
      found_ecma = found_realm = false;
      inCycle = false;
    }
    if (!inCycle && line === "cycle detected among the following nodes:") {
      inCycle = true;
      cycles++;
    } else if (inCycle) {
      cycle_len++;
      found_ecma = found_ecma || line.includes("/ecma262/");
      found_realm = found_realm || line.includes("/realm.js");
    }
  }
  if (inCycle || cycles === 0 || !(max_cycle_len > 0)) {
    console.error("Error while processing Flow stderr, couldn't find cycle information:");
    for (let line of lines) console.error(line);
    process.exit(1);
  }
  console.log("Biggest cycle: " + max_cycle_len + " (out of " + cycles + " cycles reported by Flow)");
  if (max_cycle_len > MAX_CYCLE_LEN) {
    console.error("Error: You increased cycle length from the previous high of " + MAX_CYCLE_LEN);
    console.error("This is never OK.");
    console.error("Run the following command to see the cycle: " + cmd);
    process.exit(1);
  }
});

// NB: This doesn't prevent cycles using "import type" because those are
// erased in the lib folder but madge doesn't work with flow type imports.

madge("./lib/").then(res => {
  let deps = res.obj();
  let idx_deps = res.depends("intrinsics/index");
  if (idx_deps.length !== 1 || idx_deps[0] !== "construct_realm") {
    console.error("Invalid Dependency: Intrinsics index depends on " + idx_deps[0]);
    process.exit(1);
  }

  for (let dep in deps) {
    // Nothing in intrinsics/ecma262 depends on anything but intrinsics/index except Error and global.
    if (
      dep.startsWith("intrinsics/ecma262") &&
      dep !== "intrinsics/ecma262/Error" &&
      dep !== "intrinsics/ecma262/global"
    ) {
      let ext_deps = res
        .depends(dep)
        .filter(depend => depend !== "intrinsics/index" && !depend.startsWith("intrinsics/ecma262"));
      if (ext_deps.length > 0) {
        console.error("Invalid Dependency: " + dep + " depends on " + ext_deps);
        process.exit(1);
      }
    }
  }
});
