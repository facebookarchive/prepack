// arrayNestedOptimizedFunctionsEnabled

function f(c) {
  var arr = Array.from(c);
  arr[0] = 42;
  return arr;
}

global.__optimize && __optimize(f);

inspect = () => {
  return f([{ foo: 0 }]);
};
