// arrayNestedOptimizedFunctionsEnabled
// does contain: return 42

function f(c) {
  var arr = Array.from(c);
  let obj = { foo: 42 };

  function op(x) {
    return obj;
  }

  let mapped = arr.filter(op);
  mapped[0].foo = 0;

  return obj.foo;
}
global.__optimize && __optimize(f);

inspect = () => f([0]);
