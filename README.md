# Prepack [![Circle CI](https://circleci.com/gh/facebook/prepack.png?style=shield&circle-token=895f5afce135b05dc3d680ce35f701685968781a)](https://circleci.com/gh/facebook/prepack)

Prepack is a partial evaluator for JavaScript. Prepack rewrites a JavaScript bundle, resulting in JavaScript code that executes more efficiently.
For initialization-heavy code, Prepack works best in an environment where JavaScript parsing is effectively cached.

## How it works

Prepack fully evaluates the initialization code in a JavaScript bundle and persists the resulting initialized heap as straightforward JavaScript code that efficiently rebuilds the heap without creating any temporary objects or values.
The code for any functions that are referenced by the initialization code and are reachable from the initialized heap is retained in the residual program.
Prepack may speculatively partially evaluate such residual functions, in particular residual module factory functions.

## Examples

### Hello World

```javascript
(function () {
  function hello() { return 'hello'; }
  function world() { return 'world'; }
  global.s = hello() + ' ' + world();
})();
```

becomes

```javascript
(function () {
  s = "hello world";
})();
```

### Fibonacci

```javascript
(function () {
  function fibonacci(x) {
    return x <= 1 ? x : fibonacci(x - 1) + fibonacci(x - 2);
  }
  global.x = fibonacci(23);
})();
```

becomes

```javascript
(function () {
  x = 28657;
})();
```

### Module Initialization

```javascript
(function () {
  let moduleTable = {};
  function define(id, f) { moduleTable[id] = f; }
  function require(id) {
    let x = moduleTable[id];
    return x instanceof Function ? (moduleTable[id] = x()) : x;
  }
  global.require = require;
  define("one", function() { return 1; }, "one");
  define("two", function() { return require("one") + require("one"); });
  define("three", function() { return require("two") + require("one"); });
  define("four", function() { return require("three") + require("one"); });
})();
three = require("three");
```

becomes

```javascript
(function () {
  function _2() {
    return 3 + 1;
  }

  var _1 = {
    one: 1,
    two: 2,
    three: 3,
    four: _2
  };

  function _0(id) {
    let x = _1[id];
    return x instanceof Function ? _1[id] = x() : x;
  }

  require = _0;
  three = 3;
})();
```

Note how most computations have been pre-initialized. However, the function that computes four (`_2`) remains in the residual program.
(TODO: Partially evaluating functions in the residual program, that `3 + 1` looks a bit silly.)

### Environment Interactions and Branching

```javascript
(function(){
  function fib(x) { return x <= 1 ? x : fib(x - 1) + fib(x - 2); }
  let x = Date.now();
  if (x === 0) x = fib(10);
  global.result = x;
})();
```

becomes

```javascript
(function () {
  var _0 = Date.now();
  if (typeof _0 !== "number") {
    throw new Error("Prepack model invariant violation");
  }
  result = _0 === 0 ? 55 : _0;
})();
```

## Status

- [test262 status on master branch](https://circleci.com/api/v1/project/facebook/prepack/latest/artifacts/0/$CIRCLE_ARTIFACTS/test262-status.txt?branch=master)
- [code coverage report for serialisation tests](https://circleci.com/api/v1/project/facebook/prepack/latest/artifacts/0/$CIRCLE_ARTIFACTS/coverage-report-sourcemapped/index.html?branch=master)
- To see the status for a pull request, look for the message *All checks have passed* or *All checks have failed*. Click on *Show all checks*, *Details*, *Artifacts*, and then *test262-status.txt* or *coverage-report-sourcemapped/index.html*.

## Roadmap

- [ALMOST DONE] ECMAScript 5 JavaScript interpreter: At its core, Prepack comes with a full-blown almost standards-compliant (ECMAScript 5) JavaScript interpreter --- written in JavaScript and typed with Flow.
- [ONGOING] On top of this foundation, Prepack can not only execute a JavaScript program concrete, but also symbolically. When Prepack comes across a JavaScript built-in function or language construct that doesn't support symbolic execution yet, Prepack terminates symbolic execution by throwing a special exception. We keep expanding the subset of the language and built-in functions which Prepack can execute symbolically.
- [ONGOING, low priority] ECMAScript 6 support
- [FUTURE] The JavaScript analysis framework of Prepack should be useful to implement other tools, including automated test generation by symbolic execution, taint tracking, and error finding.

## How to get the code

0. Clone repository and make it your current directory.
1. `git submodule init`
2. `git submodule update --recursive --remote`
3. Get npm and node, then do
   `npm install`

### How to build, lint, type check

0. Get the code
1. `npm run build`  
   You can later run `npm run watch` in the background to just compile changed files on the fly.
2. `npm run lint`
3. `npm run flow`

### How to run tests

0. Get the code
1. Make sure the code is built, either by running `npm run build` or `npm run watch`
2. `npm test`

You can run individual test suites as follows.
- `npm run test-serialiser`  
  This tests the interpreter and serialiser. All tests should pass.
- `npm run test-test262`  
  This tests conformance against the test262 suite. Not all will pass, increasing conformance is work in progress.

## How to run the interpreter

0. Get the code
1. Make sure the code is built, either by running `npm run build` or `npm run watch`
2. `npm run repl`  
   This starts an interactive interpreter session.

## How to run Prepack

0. Get the code
1. Make sure the code is built, either by running `npm run build` or `npm run watch`.
2. Have a JavaScript file handy that you want to prepack, for example:  
   `echo "function hello() { return 'hello'; } function world() { return 'world'; } s = hello() + ' ' + world();" >/tmp/sample.js`

3. `npm run prepack /tmp/sample.js`  
   Try `--help` for more options.

## How to validate changes

Instead of building, linting, type checking, testing separately, the following does everything together:  
`npm run validate`

## How to contribute

For more information about contributing pull requests and issues, see our [Contribution Guidelines](./CONTRIBUTING.md).

## License

Prepack is BSD-licensed. We also provide an additional patent grant.
