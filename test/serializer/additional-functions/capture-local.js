// does not contain:x = 5;
// does not contain:y = 10;

function additional1() {
  var z = { foo: 5 };
  global.x = function nested1() {
    return z;
  };
  var x = 5;
}

function additional2() {
  global.y = function nested2() {
    return 6;
  };
  var y = 10;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function inspect() {
  additional1();
  additional2();
  let x_fun = global.x;
  let x = global.x();
  let y = global.y;
  additional1();
  additional2();

  return "" + x.foo + y() + (x_fun === global.x) + (global.x() === x) + global.x().foo + global.y() + (global.y === y);
};
