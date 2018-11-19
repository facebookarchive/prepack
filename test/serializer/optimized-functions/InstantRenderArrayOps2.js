// instant render
// does contain:42

function f(c) {
  var arr = Array.from(c);
  let foo = 1;

  function op(x) {
    return foo + 41;
  }

  let mapped = arr.map(op);

  return mapped;
}
global.__optimize && __optimize(f);

inspect = () => f([0]);
