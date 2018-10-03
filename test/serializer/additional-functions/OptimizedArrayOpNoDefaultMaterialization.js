// arrayNestedOptimizedFunctionsEnabled
// does not contain:foo = 1

function f(c) {
  var arr = Array.from(c);
  let obj = { foo: 1 };

  function op(x) {
    return obj;
  }

  let mapped = arr.map(op);
  obj.foo = 2;

  return obj;
}
global.__optimize && __optimize(f);

inspect = () => JSON.stringify(f([0]));
