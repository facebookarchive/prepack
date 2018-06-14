# Debugging React Compiler Issues

The Prepack-powered React compiler prototype is in active development. There are a few scripts you can use to debug issues in it. Note that it assumes a Facebook-specific JavaScript environment, and is neither generally usable nor production-ready.

## Input Code Structure

Typically, the input should look similar to this:

```js
require('react');

__evaluatePureFunction(function() {

  // More code here

  function App() {
    // This is a React component,
    // it can be a function or a class.
  }

  __optimizeReactComponentTree(App);

  module.exports = App;

});
```

All React component definitions should be inside that `__evaluatePureFunction()` closure.

Some components may be marked with a `__optimizeReactComponentTree()` call. Those will be passed to the React reconciler. Optionally, you can pass `{ firstRenderOnly: true }` as a second argument to evaluate the tree in a special first render mode.

## Running React Compiler from the Terminal

Save the input code as `fb-www/input.js`. This file is gitignored.

Then run `yarn debug-fb-www`.

If the compilation is successful, the result will be saved to `fb-www/output.js`.

## Debugging React Compiler

If you use [Visual Studio Code](https://code.visualstudio.com/), create a file called `.vscode/launch.json`:

```js
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "node",
            "request": "launch",
            "name": "Debug fb-www",
            "program": "${workspaceFolder}/scripts/debug-fb-www.js"
        }
    ]
}
```

After you create it, open the `prepack` root folder in VS Code, and switch to the “Debugger” pane.

You will see a green button next to “Debug fb-www” command. You can start the debugger by pressing it. It will also use `fb-www/input.js` as the input, and write the result to `fb-www/output.js`.

![VS Code Screenshot](https://i.imgur.com/KRBexd1.png)

The debugger is not always reliable with setting breakpoints, so the most reliable way to pause is to write code like

```js
if (someCondition) {
  debugger;
}
```

and restart the debugger. This will cause it to pause on this line.

Typically, you’ll want to run `yarn watch` in the terminal so that any changes you made in the editor are immediately compiled.

## Running React Tests

You can run the React tests from terminal with `yarn test-react`.

To enter a watching mode, run `yarn test-react --watch`. This will re-run them on any change. This can be pretty slow.

If you’re debugging a specific test case, the easiest way to focus on it is to:

* Open `scripts/test-react.js`.
* Find the test in the code by searching for its filename.

  For example, you may find something like:

  ```js
      it("fb-www 5", async () => {
        await runTest(directory, "fb5.js");
      });
  ```

* Change `it` to `fit` to “focus” on a specific test and skip all other tests.

  ```diff
  -    it("fb-www 5", async () => {
  +    fit("fb-www 5", async () => {
        await runTest(directory, "fb5.js");
      });
  ```
* Run the watch mode: `yarn test-react --watch`

Now only this test alone will re-run on every change which should help debug problems faster.

By default, tests run in four different input/output configurations. If too many runs are confusing when debugging a problem, you can comment out all modes except one [at the very bottom of the test file](https://github.com/facebook/prepack/blob/30876d5becade1dad7319682a075b6df252341a2/scripts/test-react.js#L748-L753).

For example:

```diff
// pre non-transpiled
runTestSuite(true, false);
-runTestSuite(false, false);
+// runTestSuite(false, false);
// pre transpiled
-runTestSuite(true, true);
+ // runTestSuite(true, true);
-runTestSuite(false, true);
+ // runTestSuite(false, true);
``` 

Finally, sometimes it’s helpful to see the code Prepack is emitting. Search for a [variable called `transformedSource`](https://github.com/facebook/prepack/blob/30876d5becade1dad7319682a075b6df252341a2/scripts/test-react.js#L115) in the test file.
 If you add `console.log(transformedSource)` you will see the Prepack output during test runs.

 Don’t forget to revert any such changes before committing!
 
