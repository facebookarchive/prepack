// Copies of _\$8\(:1
// Copies of var _\$8 = _\$7.assign;:1
// inline expressions

// _$8 is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(foo, bar) {
  var a = Object.assign({}, foo, bar, { a: 1 });
  var b = Object.assign({}, a, { a: 2 });
  var c = Object.assign({}, b, { a: 2 }, { d: 5 });
  return c;
}

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return JSON.stringify(f({ b: 1 }, { c: 2 }));
};
