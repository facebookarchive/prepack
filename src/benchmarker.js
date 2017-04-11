/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Compatibility } from "./types.js";
import Serializer from "./serializer/index.js";
import invariant from "./invariant.js";

let chalk     = require("chalk");
let jsdom     = require("jsdom");
let zlib      = require("zlib");
let fs        = require("fs");
let vm        = require("vm");

function getTime() {
  let stamp = process.hrtime();
  return ((stamp[0] * 1e9) + stamp[1]) / 1e6;
}

function exec(code: string, compatibility: Compatibility) {
  let sandbox: any = {
    setTimeout: setTimeout,
    setInterval: setInterval,
    console: {
      error() {},
      log(s) {
        console.log(s);
      }
    },
  };

  let beforeCode = "var global = this; ";
  let afterCode = `// At the end of the script, Node tries to clone the 'this' Object (global) which involves executing all getters on it.
// To avoid executing any more code (which could affect timing), we just set all globals to undefined (hoping that doesn't take too long).
Object.getOwnPropertyNames(global).forEach(function(name){ if (name !== "Object" && name !== "global") global[name] = undefined; });`;

  if (compatibility === "browser") {
    beforeCode += "var window = this; var self = this; ";
    let window = jsdom.jsdom({}).defaultView;
    sandbox.window = window;
    sandbox.document = window.document;
    sandbox.navigator = window.navigator;
    sandbox.location = window.location;
  }
  if (compatibility === "jsc") {
    beforeCode += "delete global.clearInterval; delete global.clearImmediate; delete global.clearTimeout; delete global.setImmediate; delete Object.assign;";
  }

  code = `${beforeCode} ${code}; // keep newline here as code may end with comment
${afterCode}`;

  let start = getTime();
  let script = new vm.Script(code, { cachedDataProduced: false });
  let executedStart = getTime();
  script.runInNewContext(sandbox);
  let executedEnd = getTime();

  return {
    raw: code.length,
    gzip: zlib.gzipSync(code).length,
    executed: executedEnd - executedStart,
    compiled: executedStart - start,
    total: executedEnd - start
  };
}

function line(type, code, compatibility: Compatibility, moreOut = {}, compareStats = undefined) {
  let stats = exec(code, compatibility);

  function wrapTime(key) {
    return wrap(key, (ms) => `${ms.toFixed(2)}ms`, "faster", "slower");
  }

  function wrapSize(key) {
    return wrap(key, function (b) {
      let kilobytes = Math.round(b / 1000);
      if (kilobytes > 1000) {
        return `${(kilobytes / 1000).toFixed(2)}MB`;
      } else {
        return `${kilobytes}KB`;
      }
    }, "smaller", "bigger");
  }

  function wrap(key, format, positive, negative) {
    if (compareStats) {
      let before = compareStats[key];
      let after = stats[key];
      let factor;

      if (after < before) {
        factor = chalk.green(`${(before / after).toFixed(2)}x ${positive}`);
      } else {
        factor = chalk.red(`${(after / before).toFixed(2)}x ${negative}`);
      }

      return `${format(after)} ${factor}`;
    } else {
      return format(stats[key]);
    }
  }

  let out = {
    "VM Total Time": wrapTime("total"),
    "VM Compile Time": wrapTime("compiled"),
    "VM Execution Time": wrapTime("executed"),
    "Raw Code Size": wrapSize("raw"),
    "Gzip Code Size": wrapSize("gzip"),
    ...moreOut
  };

  console.log(chalk.bold(type));

  for (let key in out) {
    console.log(`  ${chalk.bold(key)} ${out[key]}`);
  }

  return stats;
}

function dump(name: string, raw: string, min: string = raw, compatibility?: "browser" | "jsc" = "browser", outputFilename?: string) {
  console.log(chalk.inverse(name));
  let beforeStats = line("Before", min, compatibility);

  let start = Date.now();
  let serialized = new Serializer({ partial: true, compatibility }).init(name, raw);
  if (!serialized) {
    process.exit(1);
    invariant(false);
  }
  let code  = serialized.code;
  let total = Date.now() - start;

  if (code.length >= 1000 || outputFilename) {
    let filename = outputFilename || (name + "-processed.js");
    console.log(`Prepacked source code written to ${filename}.`);
    fs.writeFileSync(filename, code);
  }

  line("After", code, compatibility, {
    "Prepack Compile Time": `${total}ms`
  }, beforeStats);

  if (code.length <= 1000 && !outputFilename) {
    console.log("+++++++++++++++++ Prepacked source code");
    console.log(code);
    console.log("=================");
  }
}

let args = Array.from(process.argv);
args.splice(0, 2);
let inputFilename;
let outputFilename;
let compatibility;
while (args.length) {
  let arg = args[0]; args.shift();
  if (arg === "--out") {
    arg = args[0]; args.shift();
    outputFilename = arg;
  } else if (arg === "--compatibility") {
    arg = args[0]; args.shift();
    if (arg !== "jsc") {
      console.error(`Unsupported compatibility: ${arg}`);
      process.exit(1);
    } else {
      compatibility = arg;
    }
  } else if (arg === "--help") {
    console.log("Usage: benchmarker.js [ --out output.js ] [ --compatibility jsc ] [ -- | input.js ]");
  } else if (!arg.startsWith("--")) {
    inputFilename = arg;
  } else {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  }
}

if (!inputFilename) {
  console.error("Missing input file.");
  process.exit(1);
} else {
  let input = fs.readFileSync(inputFilename, "utf8");
  dump(inputFilename, input, input, compatibility, outputFilename);
}

//dump("helloWorld", "function hello() { return 'hello'; } function world() { return 'world'; } s = hello() + ' ' + world();");

//dump("regex", "regex = /Facebook/i;");

//dump("test", "try { new WeakSet().delete.call(0, {}); } catch (e) {console.log(e);}");
//dump("test", "e = 'abcdef'.substr(1,2); ");
//dump("test", "var s = 'Promise'; e = s[0];");
//dump("test", "foo = function() { return [,0]; };");

//dump("simple", "var foo = 5 * 5; var bar = [2, 3, 'yes']; var foo2 = null; var bar2 = undefined;");
//dump("simple2", "function Foo() {} Foo.prototype.wow = function () {};");

//dump("Date.now", "Date.now");
//dump("Date.now", "this.foo = Date.now();");
//dump("object recursion", "var obj = { yes: 'no' }; obj.bar = obj; var foo = [obj]; obj.foobar = foo;");
//dump("intrinsic union", "var assign = Object.assign || function () {}; var obj = assign({ foo: 1 }, { bar: 2 });");

/*dump(
  "fbsdk",
  fs.readFileSync(__dirname + "/../assets/fbsdk.js", "utf8")
);*/

/*dump(
  "react",
  fs.readFileSync(__dirname + "/../assets/react.js", "utf8"),
  fs.readFileSync(__dirname + "/../assets/react.min.js", "utf8")
);*/

/*dump(
  "immutable",
  fs.readFileSync(__dirname + "/../assets/immutable.js", "utf8"),
  fs.readFileSync(__dirname + "/../assets/immutable.min.js", "utf8")
);*/

/*dump(
  "react-native-bundle",
  fs.readFileSync(__dirname + "/../../examples/react-native-bundle/bundle.js", "utf8")
);*/

/*dump(
  "lodash",
  fs.readFileSync(require.resolve("lodash/lodash.js"), "utf8"),
  fs.readFileSync(require.resolve("lodash/lodash.min.js"), "utf8")
);*/

/*dump(
  "underscore",
  fs.readFileSync(require.resolve("underscore"), "utf8"),
  fs.readFileSync(require.resolve("underscore/underscore-min"), "utf8")
);
*/

/*dump(
  "ember",
  fs.readFileSync("ember.prod.js", "utf8")
);

dump(
  "jquery",
  fs.readFileSync(require.resolve("jquery/dist/jquery.js"), "utf8"),
  fs.readFileSync(require.resolve("jquery/dist/jquery.min.js"), "utf8")
);

dump(
  "scrollin",
  fs.readFileSync("scrollin.js", "utf8")
);
*/
