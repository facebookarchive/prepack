// Copies of _\$4:2
// inline expressions

// Why? _$4 is the variable for Object.assign, and there should be
// two copies of it. One for it's declaration and one for its reference.
// We use inline expressions on all test iterations to ensure the copies
// count is always constant.

function f(foo) {
  var a = Object.assign({}, foo);
  var b = Object.assign({}, a);
  return b;
}

if (global.__optimize) __optimize(f);

global.inspect = function() { return f({}); }
