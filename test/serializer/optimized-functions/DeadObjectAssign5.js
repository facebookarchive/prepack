// Copies of _7:3
// _7 is the variable for Object.assign. So DeadObjectAssign4.js for
// a larger explanation.

function f(foo) {
  var a = Object.assign({}, foo);
  var b = Object.assign({}, a);
  return [a, b];
}

if (global.__optimize) __optimize(f);

global.inspect = function() { return JSON.stringify(f({})); }
