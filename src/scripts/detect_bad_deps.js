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

// NB: This doesn't prevent cycles using "import type" because those are
// erased in the lib folder but madge doesn't work with flow type imports.

madge('./lib/').then((res) => {
  let deps = res.obj();
  let idx_deps = res.depends('intrinsics/index');
  if (idx_deps.length !== 1 || idx_deps[0] !== 'construct_realm') {
    console.log("Invalid Dependency: Intrinsics index depends on " + idx_deps[0]);
    process.exit(1);
  }

  for (let dep in deps) {
    // Nothing in intrinsics/ecma262 depends on anything but intrinsics/index except Error.
    if (dep.startsWith("intrinsics/ecma262") && dep !== "intrinsics/ecma262/Error") {
      let ext_deps =
        res.depends(dep).filter(
          (depend) => depend !== "intrinsics/index" && !depend.startsWith("intrinsics/ecma262"));
      if (ext_deps.length > 0) {
        console.log("Invalid Dependency: " + dep + " depends on " + ext_deps);
        process.exit(1);
      }
    }
  }
});
