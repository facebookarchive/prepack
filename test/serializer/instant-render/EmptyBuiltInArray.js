// instant render
// add at runtime:var __empty = {};

function f(c) {
  var a = [];
  a[1] = 42;
  if (c) {
    a[0] = 42;
  }

  return a;
}

global.__optimize && __optimize(f);

let real_inspect = function() {
  let result = f(false);
  return JSON.stringify(result);
};

let fake_inspect = function() {
  return JSON.stringify([{}, 42]);
};

inspect = global.__optimize ? real_inspect : fake_inspect;
