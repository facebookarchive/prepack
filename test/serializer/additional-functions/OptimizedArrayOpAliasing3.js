// arrayNestedOptimizedFunctionsEnabled
// does not contain: return 42

function f(c) {
  var arr = Array.from(c);
  let obj = { foo: 42 };

  function op1(x) {
    return obj;
  }

  function op2(x) {
    return x;
  }

  let mapped = arr.map(op1);
  let mapped2 = mapped.map(op2);
  mapped2[0].foo = 0;

  return obj.foo;
}
global.__optimize && __optimize(f);

inspect = () => f([0]);
