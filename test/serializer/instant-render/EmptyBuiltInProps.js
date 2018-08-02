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

let real_inspect = function() {
  let result = f(false);
  return JSON.stringify(result);
};

let fake_inspect = function() {
  return JSON.stringify({ foo: {} });
};

inspect = global.__optimize ? real_inspect : fake_inspect;
