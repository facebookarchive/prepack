// Copies of _5:2
// _5 is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(foo, bar) {
  var a = Object.assign({}, foo, bar, {a: 1});
  var b = Object.assign({}, a, {a: 2});
  var c = Object.assign({}, b, {a: 2}, {d: 5});
  return c;
}

if (global.__optimize) __optimize(f);

global.inspect = function() { return JSON.stringify(f({b: 1}, {c: 2})); }
