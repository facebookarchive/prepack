// instant render
// does contain:42

function f(c) {
  var arr = Array.from(c);
  let obj = { foo: 1 };

  function op(x) {
    return obj.foo + 41;
  }

  let mapped = arr.map(op);

  return mapped;
}
global.__optimize && __optimize(f);

inspect = () => f([0]);
