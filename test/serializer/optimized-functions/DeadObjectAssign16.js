// Copies of _7:3
// _7 is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(o) {
  var p = Object.assign({}, o);
  o.x = 42;
  var q = Object.assign({}, p);
  return q;
}

if (global.__optimize) __optimize(f);

global.inspect = function() { return JSON.stringify(f({x: 10})); }
