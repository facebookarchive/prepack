// arrayNestedOptimizedFunctionsEnabled
// does contain:return true

function f(c, g) {
  var arr = Array.from(c);
  let obj = { foo: true };

  function op(x) {
    return obj.foo;
  }

  let mapped = arr.filter(op);

  return mapped;
}
global.__optimize && __optimize(f);

inspect = () => f([0], () => {});
