function bar() {
  return 123;
}

function fn(x) {
  if (!x) {
    return bar();
  }

  var foo = x.foo;
  if (!foo) {
    return 456;
  }
}

this.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify(fn());
};
