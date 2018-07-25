function f(g, c) {
  let o = { foo: {} };
  o.__proto__ = {};

  if (c) {
    g(o);
  } else {
    o.foo = { bar: 5 };
    g(o);
  }
  return o;
}

global.__optimize && __optimize(f);
inspect = function() {
  return f(o => o);
};
