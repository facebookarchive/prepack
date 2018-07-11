if (!global.__evaluatePureFunction) {
  global.__evaluatePureFunction = f => f();
}

x = __evaluatePureFunction(() => {
  var x = global.__abstract ? __abstract(undefined, "({foo: 123})") : { foo: 123 };
  var y = global.__abstract ? __abstract(undefined, "('foo')") : "foo";

  x[y] = 5;

  return x;
});

inspect = function() {
  return global.x.foo;
};
