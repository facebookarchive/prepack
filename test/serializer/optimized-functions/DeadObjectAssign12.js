// Copies of _\$G\(:2
// Copies of var _\$G = _\$F.assign;:1
// inline expressions

// _$G is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(x, foo, bar) {
  var a = Object.assign({}, foo, bar, { a: 1 });
  foo = {};
  var b;
  if (x) {
    b = Object.assign({}, a, { a: 2 });
  } else {
    b = Object.assign({}, a, { a: 5 });
  }
  var c = Object.assign({}, b, { a: 2 }, { d: 5 });
  return c;
}

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return JSON.stringify(f(false, { b: 1 }, { c: 2 }));
};
