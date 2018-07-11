// Copies of _\$6:2
// inline expressions

// _$6 is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(foo, bar) {
  var a = Object.assign({}, foo, bar, { a: 1 });
  var b = Object.assign({}, a);
  return b;
}

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return JSON.stringify(f({ b: 1 }, { c: 2 }));
};
