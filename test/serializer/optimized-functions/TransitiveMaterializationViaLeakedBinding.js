// arrayNestedOptimizedFunctionsEnabled

function f(c, g) {
  var arr = Array.from(c);
  var leaked = undefined;
  let obj = { foo: 1 };

  function leak() {
    return leaked;
  }
  g(leak);
  leaked = obj;

  function op(x) {
    return leaked;
  }

  let mapped = arr.map(op);
  let val = arr[0].foo;
  let ret = mapped[0].foo;
  obj.foo = 2;

  return ret;
}
global.__optimize && __optimize(f);

inspect = () => f([0], () => {});
