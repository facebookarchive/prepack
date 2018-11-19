// arrayNestedOptimizedFunctionsEnabled

function f(c, b) {
  var arr = Array.from(c);
  let obj = { foo: 1 };

  function nested(x) {
    return b ? x : undefined;
  }

  function op(x) {
    return nested(x);
  }

  let mapped = arr.map(op);
  let val = arr[0].foo;
  let ret = mapped[0].foo;
  obj.foo = 2;

  return ret;
}

global.__optimize && __optimize(f);

inspect = () => f([0], true);
