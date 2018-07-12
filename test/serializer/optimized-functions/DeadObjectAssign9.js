// Copies of _\$6\(:1
// Copies of var _\$6 = _\$5.assign;:1
// inline expressions

// _$6 is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(foo, bar) {
  var a = Object.assign({}, foo, bar, { a: 1 });
  var b = Object.assign({}, a, { a: 2 });
  return b;
}

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return JSON.stringify(f({ b: 1 }, { c: 2 }));
};
