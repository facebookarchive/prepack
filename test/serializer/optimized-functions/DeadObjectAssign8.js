// Copies of _5:2
// _5 is the variable for Object.assign. So DeadObjectAssign4.js for
// a larger explanation.

function f(foo, bar) {
  var a = Object.assign({}, foo, bar, {a: 1});
  var b = Object.assign({}, a);
  return b;
}

if (global.__optimize) __optimize(f);

global.inspect = function() { return JSON.stringify(f({b: 1}, {c: 2})); }
