// arrayNestedOptimizedFunctionsEnabled

function f(c) {
  var arr = Array.from(c);
  let obj = { foo: 1 };

  function op(x) {
    return this;
  }

  let bop = op.bind(obj);
  let mapped = arr.map(bop);
  let val = arr[0].foo;
  let ret = mapped[0].foo;
  obj.foo = 2;

  return ret;
}
global.__optimize && __optimize(f);

inspect = () => f([0]);
