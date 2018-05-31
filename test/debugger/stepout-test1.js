/*
Basic test for stepOut.

Nested function calls -- stepOut on a breakpoint at line 23 (return 4 in function d())
should allow us to step back into c, then b, then a.
*/

let a = function() {
	b();
	return 1;
}

let b = function() {
	c();
	return 2;
}

let c = function() {
	d();
	return 3;
}

let d = function() {
	return 4;
}

a();



/* Expected Output

Debugger is starting up Prepack...
Prepack is ready
(dbg) breakpoint add test/debugger/stepout-test1.js 24
(dbg) run
Breakpoint: test/debugger/stepout-test1.js 24:1
(dbg) stepOut
Step Out: test/debugger/stepout-test1.js 20:1
(dbg) stepOut
Step Out: test/debugger/stepout-test1.js 15:1
(dbg) stepOut
Step Out: test/debugger/stepout-test1.js 10:1
(dbg) stepOut
Prepack exited! Shutting down...
davidcai-mbp:prepack davidcai$

*/
