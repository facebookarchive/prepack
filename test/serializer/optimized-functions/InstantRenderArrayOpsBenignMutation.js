// instant render

function f(c) {
  var arr = Array.from(c);
  let obj = { foo: 1 };

  function op(x) {
    return obj;
  }

  let mapped = arr.map(op);
  obj.foo = 2; // Allowed - the non-final value of obj is not referenced

  return obj;
}
global.__optimize && __optimize(f);

inspect = () => JSON.stringify(f([0]));
