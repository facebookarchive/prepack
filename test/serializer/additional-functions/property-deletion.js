// does not contain:x = 5;
// does not contain:y = 10;

global.foo = { x: 100, y: 200 };
var z = 42;

function additional1() {
  global.foo.foo = z + global.foo.x;
  delete global.foo.x;
  var x = 5;
}

function additional2() {
  global.foo.bar = z + global.foo.y;
  delete global.foo.y;
  var y = 10;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  let foo = global.foo;
  return "" + foo.x + foo.y + foo.foo + foo.bar;
};
