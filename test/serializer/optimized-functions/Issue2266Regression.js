// expected Warning:
function outer() {
  function inner() {
    return 42;
  }
  if (global.__optimize) __optimize(inner);
  return inner;
}
if (global.__optimize) __optimize(outer);
global.inspect = function() {
  return outer()();
};
