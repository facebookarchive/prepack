function inner(props) {
  var foo = Array.from(props.foo);
  var bar = foo.filter(Boolean);
  bar.reverse();

  return bar;
}

function fn(arg) {
  if (!arg.condition) {
    return null;
  }
  return inner(arg);
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  return JSON.stringify([
    fn({ condition: false }),
    fn({ condition: true, foo: [1, 2, 3] }),
    fn({ condition: true, foo: [false, 1, 2] }),
    fn({ condition: true, foo: [true, 1, 2] }),
    fn({ condition: true, foo: [false, 5, 4] }),
    fn({ condition: true, foo: [true, 5, 8] }),
  ]);
};
