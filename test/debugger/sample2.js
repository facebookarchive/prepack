/*
Recursive test for stepOut.
*/

function recurse(depth) {
  if (depth > 5) {
    console.log("end of recursion");
    return;
  }
  console.log(`recursing: ${depth}`);
  recurse(depth + 1);
  console.log(`finished: ${depth}`);
}

recurse(1);

/* Expected Output
Debugger is starting up Prepack...
Prepack is ready
(dbg) breakpoint add test/debugger/stepout-test2.js 11
(dbg) run
Breakpoint: test/debugger/stepout-test2.js 11:1
(dbg) run
Breakpoint: test/debugger/stepout-test2.js 11:1
(dbg) run
Breakpoint: test/debugger/stepout-test2.js 11:1
(dbg) run
Breakpoint: test/debugger/stepout-test2.js 11:1
(dbg) run
Breakpoint: test/debugger/stepout-test2.js 11:1
(dbg) stepOut
Step Out: test/debugger/stepout-test2.js 12:1
(dbg) stepOut
Step Out: test/debugger/stepout-test2.js 12:1
(dbg) stepOut
Step Out: test/debugger/stepout-test2.js 12:1
(dbg) stepOut
Step Out: test/debugger/stepout-test2.js 12:1
(dbg) stepOut
Prepack output:
...
*/