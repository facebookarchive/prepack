function inner(props, x) {
  var foo = Array.from(props.foo);
  var bar = foo.filter(Boolean);

  x(bar);
  bar[0] = 0;

  return bar[0];
}

function fn(arg, x) {
  if (!arg.condition) {
    return null;
  }
  return inner(arg, x);
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  return JSON.stringify([
    fn({ condition: false }, function(a) {
      a[0] = 1;
    }),
    fn({ condition: true, foo: [] }, function(a) {
      a[0] = 1;
    }),
    fn({ condition: true, foo: [null, false] }, function(a) {
      a[0] = 1;
    }),
    fn({ condition: true, foo: [null, true] }, function(a) {
      a[0] = 1;
    }),
    fn({ condition: true, foo: [null, false, 5] }, function(a) {
      a[0] = 1;
    }),
    fn({ condition: true, foo: [null, true, 5] }, function(a) {
      a[0] = 1;
    }),
  ]);
};
