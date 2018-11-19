function fn(abstractFunc) {
  var x = { a: 2, b: 3 };
  global.__makeFinal ? global.__makeFinal(x) : Object.freeze(x);
  abstractFunc(x);
  return x.a + x.b;
}

global.__optimize && __optimize(fn);

global.inspect = function() {
  return fn(function(x) {
    // this would never happen, as the object passed
    // in is final, aka "frozen", but it proves the
    // isFinal logic works
    x.a = 7;
  });
};
