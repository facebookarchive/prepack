// instant render
// add at runtime:var __empty = {};

function f(c) {
  var a = {};
  if (c) {
    a.foo = 42;
  }

  return a;
}

global.__optimize && __optimize(f);

inspect = function() {
  let result = f(false);
  if (!global.__optimize) result.foo = {};
  return JSON.stringify(result);
};
