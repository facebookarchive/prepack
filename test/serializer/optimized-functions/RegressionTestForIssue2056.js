function fn(arg) {
  var value = arg.x !== null ? arg.x : 0;

  function fn2() {
    return value;
  }
  global.__optimize && __optimize(fn2);

  return Array.from(arg.arr).map(fn2);
}

global.__optimize && __optimize(fn);

global.inspect = function() {
  return JSON.stringify([fn({ arr: [1, 2, 3], x: 1 }), fn({ arr: [1, 2, 3], x: null })]);
};
