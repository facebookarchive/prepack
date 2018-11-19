// Copies of _\$4\(:1
// Copies of var _\$4 = _\$3.assign;:1
// inline expressions

// Why? _$3 is the variable for Object.assign, and there should be
// two copies of it. One for it's declaration and one for its reference.
// We use inline expressions on all test iterations to ensure the copies
// count is always constant.

function f(foo) {
  var a = Object.assign({}, foo);
  var b = Object.assign({}, a);
  return b;
}

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return f({});
};
