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
const fs = require("fs");
const glob = require("glob");
const prettier = require("prettier");
const execFileSync = require("child_process").execFileSync;

const mode = process.argv[2] || "check";
const prettierConfigPath = require.resolve("../.prettierrc");
const shouldWrite = mode === "write" || mode === "write-changed";
const onlyChanged = mode === "check-changed" || mode === "write-changed";

const config = {
  default: {
    patterns: ["src/**/*.js"],
  },
  scripts: {
    patterns: ["scripts/**/*.js"],
  },
  jest: {
    patterns: ["test/**/*.js"],
    ignore: ["test/**/syntaxError.js", "test/test262/**/*.js"],
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
  const ignore = config[key].ignore;

  const globPattern = patterns.length > 1 ? `{${patterns.join(",")}}` : `${patterns.join(",")}`;
  const files = glob.sync(globPattern, { ignore }).filter(f => !onlyChanged || changedFiles.has(f));

  if (!files.length) {
    return;
  }

  let didWarn = false;
  let didError = false;

  files.forEach(file => {
    const options = prettier.resolveConfig.sync(file, {
      config: prettierConfigPath,
    });
    try {
      const input = fs.readFileSync(file, "utf8");
      if (shouldWrite) {
        const output = prettier.format(input, options);
        if (output !== input) {
          fs.writeFileSync(file, output, "utf8");
        }
      } else {
        if (!prettier.check(input, options)) {
          if (!didWarn) {
            console.log(
              "\n" +
                chalk.red(`  This project uses prettier to format all JavaScript code.\n`) +
                chalk.dim(`  Please run `) +
                chalk.reset("yarn prettier-all") +
                chalk.dim(` and add changes to files listed below to your commit:`) +
                `\n`
            );
            didWarn = true;
          }
          console.log(`  ${file}`);
        }
      }
    } catch (error) {
      didError = true;
      console.log("\n\n" + error.message);
      console.log(file);
    }
  });

  if (didWarn || didError) {
    console.log();
    process.exit(1);
  }
});
