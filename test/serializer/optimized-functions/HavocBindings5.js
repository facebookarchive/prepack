function foo(a, b, c) {
  if (!a) {
    return null;
  }
  var b = Object.assign({}, c);

  return a.callFunc(function() {
    return b.foo;
  });
}

inspect = function() {
  return JSON.stringify(
    foo({
      a: {
        callFunc(x) {
          return x();
        },
      },
      b: {
        foo() {
          return "works!";
        },
      },
      c: {},
    })
  );
};

this.__optimize && __optimize(foo);
