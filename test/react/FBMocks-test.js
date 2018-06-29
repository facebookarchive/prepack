/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

const fs = require("fs");
const prepareReactTests = require("./prepareReactTests");
const { runTest, expectReconcilerFatalError, stubReactRelay } = prepareReactTests();

/* eslint-disable no-undef */
const { it } = global;

it("fb-www", async () => {
  await stubReactRelay(async () => {
    await runTest(__dirname + "/FBMocks/fb1.js");
  });
});

it("fb-www 2", async () => {
  await runTest(__dirname + "/FBMocks/fb2.js");
});

it("fb-www 3", async () => {
  await stubReactRelay(async () => {
    await runTest(__dirname + "/FBMocks/fb3.js");
  });
});

it("fb-www 4", async () => {
  await stubReactRelay(async () => {
    await runTest(__dirname + "/FBMocks/fb4.js");
  });
});

it("fb-www 5", async () => {
  await runTest(__dirname + "/FBMocks/fb5.js");
});

it("fb-www 6", async () => {
  await runTest(__dirname + "/FBMocks/fb6.js");
});

it("fb-www 7", async () => {
  await runTest(__dirname + "/FBMocks/fb7.js");
});

it("fb-www 8", async () => {
  await runTest(__dirname + "/FBMocks/fb8.js");
});

it("fb-www 9", async () => {
  await runTest(__dirname + "/FBMocks/fb9.js");
});

it("fb-www 10", async () => {
  await runTest(__dirname + "/FBMocks/fb10.js");
});

it("fb-www 11", async () => {
  await runTest(__dirname + "/FBMocks/fb11.js");
});

it("fb-www 12", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FBMocks/fb12.js");
  });
});

it("fb-www 13", async () => {
  await runTest(__dirname + "/FBMocks/fb13.js");
});

it("fb-www 14", async () => {
  await runTest(__dirname + "/FBMocks/fb14.js");
});

it("fb-www 15", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FBMocks/fb15.js");
  });
});

it("fb-www 16", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FBMocks/fb16.js");
  });
});

it("fb-www 17", async () => {
  await runTest(__dirname + "/FBMocks/fb17.js");
});

// Test fails for two reasons:
// - "uri.foo" on abstract string does not exist
// - unused.bar() does not exist (even if in try/catch)
it("fb-www 18", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FBMocks/fb18.js");
  });
});

it("fb-www 19", async () => {
  await expectReconcilerFatalError(async () => {
    await runTest(__dirname + "/FBMocks/fb19.js");
  });
});

it("fb-www 20", async () => {
  await runTest(__dirname + "/FBMocks/fb20.js");
});

it("fb-www 21", async () => {
  await runTest(__dirname + "/FBMocks/fb21.js");
});

it("fb-www 22", async () => {
  await runTest(__dirname + "/FBMocks/fb22.js");
});

it("fb-www 23", async () => {
  await runTest(__dirname + "/FBMocks/fb23.js");
});

it("repl example", async () => {
  await runTest(__dirname + "/FBMocks/repl-example.js");
});

it("Hacker News app", async () => {
  let data = JSON.parse(fs.readFileSync(__dirname + "/FBMocks/hacker-news.json").toString());
  await runTest(__dirname + "/FBMocks/hacker-news.js", false, data);
});

it("Function bind", async () => {
  await runTest(__dirname + "/FBMocks/function-bind.js");
});
