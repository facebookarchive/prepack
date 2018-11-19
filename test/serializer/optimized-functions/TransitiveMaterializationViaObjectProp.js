// arrayNestedOptimizedFunctionsEnabled

function f(c) {
  var arr = Array.from(c);
  let obj = { foo: 1 };
  let obj2 = { bar: obj };

  function op(x) {
    return obj2;
  }

  let mapped = arr.map(op);
  let val = arr[0].foo;
  let ret = mapped[0].foo;
  obj.foo = 2;

  return ret;
}
global.__optimize && __optimize(f);

inspect = () => f([0]);
