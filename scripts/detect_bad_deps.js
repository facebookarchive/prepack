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

exec("flow check --profile", function(error, stdout, stderr) {
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
  let start = stderr.indexOf("cycle detected among the following files");
  let lines = stderr.substr(start).split("\n").splice(1);
  let found_ecma = false;
  let found_realm = false;
  let cycle_len = 0;
  for (let line of lines) {
    if (!line.startsWith("\t")) break;
    cycle_len += 1;
    found_ecma = found_ecma || line.includes("/ecma262/");
    found_realm = found_realm || line.includes("/realm.js");
  }
  if (found_ecma && found_realm) {
    console.log("Invalid Dependencies: ecma262/ is in a circular dependency with realm.js");
    process.exit(1);
  }
  console.log("Biggest cycle: " + cycle_len);
  let MAX_CYCLE_LEN = 58; // NEVER EVER increase this value
  if (cycle_len > MAX_CYCLE_LEN) {
    console.log("Error: You increased cycle length from the previous high of " + MAX_CYCLE_LEN);
    console.log("This is never OK.");
    process.exit(1);
  }
});

// NB: This doesn't prevent cycles using "import type" because those are
// erased in the lib folder but madge doesn't work with flow type imports.

madge("./lib/").then(res => {
  let deps = res.obj();
  let idx_deps = res.depends("intrinsics/index");
  if (idx_deps.length !== 1 || idx_deps[0] !== "construct_realm") {
    console.log("Invalid Dependency: Intrinsics index depends on " + idx_deps[0]);
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
        console.log("Invalid Dependency: " + dep + " depends on " + ext_deps);
        process.exit(1);
      }
    }
  }
});
