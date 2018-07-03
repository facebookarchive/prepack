/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

// Mostly taken from a script in React
// https://github.com/facebook/react/blob/master/scripts/prettier/index.js

const chalk = require("chalk");
const glob = require("glob");
const path = require("path");
const execFileSync = require("child_process").execFileSync;

const mode = process.argv[2] || "check";
const shouldWrite = mode === "write" || mode === "write-changed";
const onlyChanged = mode === "check-changed" || mode === "write-changed";

const isWindows = process.platform === "win32";
const prettier = isWindows ? "prettier.cmd" : "prettier";
const prettierCmd = path.resolve(__dirname, "../node_modules/.bin/" + prettier);
const defaultOptions = {
  "trailing-comma": "es5",
  "print-width": 120,
};
const config = {
  default: {
    patterns: ["src/**/*.js"],
  },
  scripts: {
    patterns: ["scripts/**/*.js"],
  },
  jest: {
    patterns: ["test/react/**/*.js"],
  },
};

function exec(command, args, options = {}) {
  console.log("> " + [command].concat(args).join(" "));
  return execFileSync(command, args, options).toString();
}

const mergeBase = exec("git", ["merge-base", "HEAD", "master"]).trim();
const changedFiles = new Set(
  exec("git", ["diff", "-z", "--name-only", "--diff-filter=ACMRTUB", mergeBase]).match(/[^\0]+/g)
);

Object.keys(config).forEach(key => {
  const patterns = config[key].patterns;
  const options = config[key].options;
  const ignore = config[key].ignore;

  const globPattern = patterns.length > 1 ? `{${patterns.join(",")}}` : `${patterns.join(",")}`;
  const files = glob.sync(globPattern, { ignore }).filter(f => !onlyChanged || changedFiles.has(f));

  if (!files.length) {
    return;
  }

  const args = Object.keys(defaultOptions).map(k => `--${k}=${(options && options[k]) || defaultOptions[k]}`);
  args.push(`--${shouldWrite ? "write" : "l"}`);

  let result;
  try {
    result = exec(prettierCmd, [...args, ...files]);
  } catch (e) {
    if (!shouldWrite) {
      console.log(
        "\n" +
          e.output[1] +
          "\n" +
          chalk.red(`  This project uses prettier to format all JavaScript code.\n`) +
          chalk.dim(`    Please run `) +
          chalk.reset("yarn prettier") +
          chalk.dim(` and add changes to files listed above to your commit.`) +
          `\n`
      );
      process.exit(1);
    }
    throw e;
  }
  console.log("\n" + result);
});
