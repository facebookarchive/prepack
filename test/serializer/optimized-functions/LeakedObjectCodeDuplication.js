// Copies of 42:1
function f(g) {
  var o = {};
  o.foo = 42;
  g(o);
  return o;
}

global.__optimize && __optimize(f);
inspect = function() {
  return f(o => o);
};
