/*
Basic test for stepOut
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