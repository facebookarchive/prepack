// Copies of _\$A\(:2
// Copies of var _\$A = _\$9.assign;:1
// inline expressions

// _$A is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(o) {
  var p = Object.assign({}, o, { a: 1 });
  var q = Object.assign({}, p, { a: 3 });
  var p2 = Object.assign({}, o, { a: 2 });
  var q2 = Object.assign({}, p2, { a: 4 });
  return [q, q2];
}

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return JSON.stringify(f({ a: 10 }));
};
