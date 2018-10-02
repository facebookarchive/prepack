// arrayNestedOptimizedFunctionsEnabled
// does not contain: 42

function f(c) {
  var arr = Array.from(c);
  let x = 1;

  function op(x) {
    return x + 41;
  }

  let mapped = arr.map(op);
  x = 2;
  let mapped2 = mapped.map(op);
  let mapped3 = mapped2.map(op);

  return mapped3;
}
global.__optimize && __optimize(f);

inspect = () => f([0]);
