// arrayNestedOptimizedFunctionsEnabled

function f(c, b) {
  var arr = Array.from(c);
  let obj = b ? { foo: 1 } : { foo: 2 };

  function op(x) {
    return obj;
  }

  let mapped = arr.map(op);
  let val = arr[0].foo;
  let ret = mapped[0].foo;
  obj.foo = 2;

  return ret;
}

global.__optimize && __optimize(f);

inspect = () => f([0], true);
