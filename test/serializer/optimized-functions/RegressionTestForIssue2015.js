function inner(a, b) {
  var foo = a.foo;

  b(function() {
    foo[0] = 1;
  });

  return foo;
}

function fn(a, b) {
  if (!a.condition) {
    return null;
  }
  return inner(a, b);
}

if (global.__optimize) __optimize(fn);
inspect = function() {
  return fn({});
}; // basically, just make sure we don't crash
