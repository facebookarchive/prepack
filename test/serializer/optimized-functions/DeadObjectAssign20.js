// Copies of _\$5\(:1
// Copies of var _\$5 = _\$4.assign;:1
// inline expressions

// _$5 is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(o) {
  var p = Object.assign({}, o);
  var l = {};
  var q = Object.assign({}, p, l);
  l.x = 42;
  var r = Object.assign({}, q);
  return r;
}

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return JSON.stringify(f({ x: 10 }));
};
