if (!global.__evaluatePureFunction) {
  global.__evaluatePureFunction = f => f();
}

__evaluatePureFunction(() => {
  var x =
    (global.__abstract ? __abstract(undefined, "({foo: 123})") : { foo: 123 }) ||
    (global.__abstract ? __abstract(undefind, "(false)") : false);
  var y = global.__abstract ? __abstract(undefined, "('foo')") : "foo";

  global.x = x[y];
});

inspect = function() {
  return global.x;
};
