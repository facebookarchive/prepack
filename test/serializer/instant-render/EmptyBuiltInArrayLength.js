// instant render
// add at runtime:var __empty = {};

function f(c) {
  var a = [5, 6, 7];
  let l0 = a.length;
  if (c) {
    a[3] = 42;
  }
  let l1 = a.length;

  return [l0, l1];
}

global.__optimize && __optimize(f);

inspect = function() {
  return JSON.stringify([f(false), f(true)]);
};
