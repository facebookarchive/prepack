# Prepack [![Circle CI](https://circleci.com/gh/facebook/prepack.png?style=shield&circle-token=1109197a81e634fd06e162c25d309a420585acd5)](https://circleci.com/gh/facebook/prepack)

Prepack is a partial evaluator for JavaScript. Prepack rewrites a JavaScript bundle, resulting in JavaScript code that executes more efficiently.
For initialization-heavy code, Prepack works best in an environment where JavaScript parsing is effectively cached.

See the official [prepack.io](http://prepack.io) website for an introduction and an [interactive REPL playground](http://prepack.io/repl.html).

## How to use Prepack

Install the CLI via npm,

```bash
$ npm install -g prepack
```
Or if you prefer yarn,

```bash
$ yarn global add prepack
```
You may need to `prepend`(pun intended!) the command with `sudo` in some cases.

### Let the party begin

To compile a file and print the output to the console:

```bash
$ prepack script.js
```

If you want to compile a file and output to another file:

```bash
$ prepack script.js --out script-processed.js
```

Detailed instructions and the API can be found at [Prepack CLI: Getting Started](https://prepack.io/getting-started.html)

## Status

- [test262 status on master branch](https://circleci.com/api/v1/project/facebook/prepack/latest/artifacts/0/$CIRCLE_ARTIFACTS/test262-status.txt?branch=master)
- [code coverage report for serialization tests](https://circleci.com/api/v1/project/facebook/prepack/latest/artifacts/0/$CIRCLE_ARTIFACTS/coverage-report-sourcemapped/index.html?branch=master)
- To see the status for a pull request, look for the message *All checks have passed* or *All checks have failed*. Click on *Show all checks*, *Details*, *Artifacts*, and then *test262-status.txt* or *coverage-report-sourcemapped/index.html*.

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
- `npm run test-serializer`  
  This tests the interpreter and serializer. All tests should pass.
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

## How to edit the website

The content for [prepack.io](http://prepack.io) resides in the [gh-pages branch](https://github.com/facebook/prepack/tree/gh-pages) of this repository. To make changes, submit a pull request, just like for any code changes. In order to run the website locally at [localhost:8000](http://localhost:8000), run `python -m SimpleHTTPServer` (Python 2) or `python -m http.server` (Python 3) from the cloned `gh-pages` branch.

At this time, a particular bundled version of Prepack is checked in to the `gh-pages` branch at `js/prepack.min.js`. To update the bundle, run `npm run build-bundle` from the `master` branch, and copy the resulting `prepack.min.js` file into the `gh-pages` branch into the `js` directory, and submit a pull request for that change.

## How to contribute

For more information about contributing pull requests and issues, see our [Contribution Guidelines](./CONTRIBUTING.md).

## License

Prepack is BSD-licensed. We also provide an additional patent grant.
