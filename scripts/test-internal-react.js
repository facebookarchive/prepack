/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

let chalk = require("chalk");
let execSync = require("child_process").execSync;
let mkdirp = require("mkdirp");
let path = require("path");
let fs = require("fs");

function search(dir, relative) {
  let tests = [];

  if (fs.existsSync(dir)) {
    for (let name of fs.readdirSync(dir)) {
      let loc = path.join(dir, name);
      let stat = fs.statSync(loc);

      if (stat.isFile()) {
        tests.push({
          name: path.join(relative, name),
          // $FlowFixMe
          config: require(loc),
        });
      } else if (stat.isDirectory()) {
        tests = tests.concat(search(loc, path.join(relative, name)));
      }
    }
  }

  return tests;
}

let tests = search(`${__dirname}/../facebook/test-react`, "facebook/test-react");

function runTest(name: string, config: any) {
  // Verify the original test passes without Prepack
  console.log(chalk.inverse(name));
  const { testName, testBundle } = config;
  console.log("-----------------------------");
  console.log("Running tests before Prepack:");
  console.log(chalk.bold(`js1 jest ${testName}`));
  console.log("-----------------------------");
  execSync(`${__dirname}/../../js/scripts/jest/jest ${testName}`, { stdio: "inherit" });
  console.log("\n\n\n");

  // Verify we can Prepack the bundle
  console.log("-----------------------------");
  console.log("Prepacking:");
  console.log(chalk.bold(path.resolve(testBundle)));
  console.log("-----------------------------");
  const sourceCode = fs.readFileSync(testBundle, "utf8");
  mkdirp.sync(`${__dirname}/../fb-www`);

  fs.writeFileSync(`${__dirname}/../fb-www/input.js`, sourceCode, "utf8");
  execSync(
    `${__dirname}/../../third-party/node/bin/node --max_old_space_size=16384 --heap-growing-percent=50 scripts/debug-fb-www.js `,
    { stdio: "inherit" }
  );
  console.log("\n\n\n");

  console.log("-----------------------------");
  console.log("Running tests after Prepack:");
  console.log(chalk.bold(`js1 jest ${testName}`));
  console.log("-----------------------------");
  const outputCode = fs.readFileSync(`${__dirname}/../fb-www/output.js`, "utf8");
  try {
    fs.writeFileSync(
      testBundle,
      `
      (function() {
        const React = require('react');
        ${outputCode}
      }).call(global);
    `,
      "utf8"
    );
    // Verify the test passes on the output
    execSync(`${__dirname}/../../js/scripts/jest/jest ${testName}`, { stdio: "inherit" });
    console.log("\n\n\n");
    console.log("Success!");
  } finally {
    // Revert the change.
    fs.writeFileSync(testBundle, sourceCode, "utf8");
  }
}

function run() {
  let failed = 0;
  let passed = 0;
  let total = 0;

  for (let test of tests) {
    if (!test.name.endsWith(".js")) continue;

    total++;
    try {
      runTest(test.name, test.config);
      passed++;
    } catch (err) {
      console.error(err.stack || err);
      failed++;
    }
  }

  console.log("Passed:", `${passed}/${total}`, (Math.floor((passed / total) * 100) || 0) + "%");
  return failed === 0;
}

if (!run()) process.exit(1);
