// does not contain:x = 5;
// does not contain:y = 10;

function additional1() {
  var z = { foo: 5 };
  global.x = z;
  var x = 5;
}

function additional2() {
  var z = { bar: 6 };
  global.y = z;
  var y = 10;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional1();
  additional2();
  let x = global.x;
  let y = global.y;
  additional1();

  return "" + x.foo + y.bar + (global.x === x) + global.x.foo;
};
