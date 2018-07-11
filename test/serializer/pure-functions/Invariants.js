var invariant = function(condition, message) {
  if (condition) return;
  throw new Error(message);
};

if (!global.__evaluatePureFunction) {
  global.__evaluatePureFunction = f => f();
}

__evaluatePureFunction(() => {
  var x = global.__abstract
    ? __abstract("object", "({foo: {foo2: {}}, bar: {bar2: {}}})")
    : { foo: { foo2: {} }, bar: { bar2: {} } };

  if (global.__makeSimple) {
    __makeSimple(x);
  }

  var foo = x.foo;
  var bar = x.bar;

  var foo2 = foo.foo2;
  var bar2 = foo.bar2;

  foo2 || invariant(0, "Should not error 1!");
  bar2 || invariant(0, "Should not error 2!");
});
