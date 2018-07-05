// Copies of _5:2
// Why? _5 is the variable for Object.assign, and there should be
// two copies of it. One for it's declaration and one for its reference.
// I could not think of another way of getting this test to work only
// for the compiled output. Passing in values to the optimized function
// with getters or monkey patching Object.assign breaks because the
// instances does not match compiled vs non-compiled.

function f(foo) {
  var a = Object.assign({}, foo);
  var b = Object.assign({}, a);
  return b;
}

if (global.__optimize) __optimize(f);

global.inspect = function() { return f({}); }
