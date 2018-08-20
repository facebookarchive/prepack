// arrayNestedOptimizedFunctionsEnabled

function f(c) {
  var arr = Array.from(c);

  let a = { foo: 1 };
  function op(o) {
    return a;
  }

  let mapped = arr.map(op);
  mapped[0] = 2;
  let x = a.foo;
  return x;
}

global.__optimize && __optimize(f);

inspect = () => {
  return f([{ foo: 42 }]);
};
