// Copies of _8:3
// _8 is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(x, foo) {
  var a = Object.assign({}, foo);
  
  return x ? Object.assign({}, a, {a: 1}) : Object.assign({}, a, {a: 2})
}

if (global.__optimize) __optimize(f);

global.inspect = function() { return f(false, {a: 3}); }
