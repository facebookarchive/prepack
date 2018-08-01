// instant render
// add at runtime:var __empty = {};

function f(c) {
  var a = [];
  if (c) {
    a[0] = 42;
  }

  return a;
}

global.__optimize && __optimize(f);

inspect = function() {
  let result = f(false);
  if (!global.__optimize) result[0] = {};
  return JSON.stringify(result);
};
