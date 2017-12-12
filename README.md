# Prepack [![Circle CI](https://circleci.com/gh/facebook/prepack.png?style=shield&circle-token=1109197a81e634fd06e162c25d309a420585acd5)](https://circleci.com/gh/facebook/prepack)

Prepack is a partial evaluator for JavaScript. Prepack rewrites a JavaScript bundle, resulting in JavaScript code that executes more efficiently.
For initialization-heavy code, Prepack works best in an environment where JavaScript parsing is effectively cached.

See the official [prepack.io](https://prepack.io) website for an introduction and an [interactive REPL playground](https://prepack.io/repl.html).

## How to use Prepack

Install the CLI via npm,

```bash
$ npm install -g prepack
```

Or if you prefer yarn, make sure you get yarn first,
```bash
$ npm install -g yarn
```
and then install the Prepack CLI via yarn:

```bash
$ yarn global add prepack
```
You may need to `prepend` (pun intended!) the command with `sudo` in some cases.

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

### Plugins to other tools
The following are a few plugins to other tools. They have been created and are maintained separately from Prepack itself. If you run into any issues with those plugins, please ask the plugin maintainers for support.

- [A Rollup plugin for Prepack](https://www.npmjs.com/package/rollup-plugin-prepack)
- [A Webpack plugin for Prepack](https://www.npmjs.com/package/prepack-webpack-plugin)
- [A Visual Studio code plugin for Prepack](https://marketplace.visualstudio.com/items?itemName=RobinMalfait.prepack-vscode)
- [A babel plugin which transforms Flow annotations into prepack model declarations](https://www.npmjs.com/package/babel-plugin-flow-prepack).

## Status

- [test262 status on master branch](https://circleci.com/api/v1/project/facebook/prepack/latest/artifacts/0/$CIRCLE_ARTIFACTS/test262-status.txt?branch=master)
- [code coverage report for serialization tests](https://circleci.com/api/v1/project/facebook/prepack/latest/artifacts/0/$CIRCLE_ARTIFACTS/coverage-report-sourcemapped/index.html?branch=master)
- To see the status for a pull request, look for the message *All checks have passed* or *All checks have failed*. Click on *Show all checks*, *Details*, *Artifacts*, and then *test262-status.txt* or *coverage-report-sourcemapped/index.html*.

## How to get the code

0. Clone repository and make it your current directory.
1. `git submodule init`
2. `git submodule update --init`
3. Get yarn and node, then do
   `yarn`

Note: For development work you really need `yarn`, as many scripts require it.

### How to build, lint, type check

0. Get the code
1. `yarn build`  
   You can later run `yarn watch` in the background to just compile changed files on the fly.
2. `yarn lint`
3. `yarn flow`

### How to run tests

0. Get the code
1. Make sure the code is built, either by running `yarn build` or `yarn watch`
2. `yarn test`

You can run individual test suites as follows:
- `yarn test-serializer`  
  This tests the interpreter and serializer. All tests should pass.
- `yarn test-test262`  
  This tests conformance against the test262 suite. Not all will pass, increasing conformance is work in progress.

## How to run the interpreter

0. Get the code
1. Make sure the code is built, either by running `yarn build` or `yarn watch`
2. `yarn repl`  
   This starts an interactive interpreter session.

## How to run Prepack

0. Get the code
1. Make sure the code is built, either by running `yarn build` or `yarn watch`.
2. Have a JavaScript file handy that you want to prepack, for example:  
   `echo "function hello() { return 'hello'; } function world() { return 'world'; } s = hello() + ' ' + world();" >/tmp/sample.js`

3. `cat /tmp/sample.js | yarn prepack`  
   Try `--help` for more options.

## How to validate changes

Instead of building, linting, type checking, testing separately, the following does everything together:  
`yarn validate`

## How to edit the website

The content for [prepack.io](https://prepack.io) resides in the [website directory](https://github.com/facebook/prepack/tree/master/website) of this repository. To make changes, submit a pull request, just like for any code changes.

In order to run the website locally at [localhost:8000](http://localhost:8000):
1. Build prepack into the website: `yarn build-bundle && mv prepack.min.js website/js`
2. Run `python -m SimpleHTTPServer` (Python 2) or `python -m http.server` (Python 3) from the `website/` directory

## How to contribute

For more information about contributing pull requests and issues, see our [Contribution Guidelines](./CONTRIBUTING.md).

## License

Prepack is BSD-licensed. We also provide an additional patent grant.
