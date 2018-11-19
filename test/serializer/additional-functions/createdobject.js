// does not contain:x = 5;
// does not contain:y = 10;
let toCapture1 = {};

function additional1() {
  toCapture1 = 5;
  var x = 5;
  x = 10;
  global.x = x;
}

function additional2() {
  var y = 10;
  y = 5;
  global.y = y;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function inspect() {
  let z = toCapture1;
  additional1();
  let z2 = toCapture1;
  additional2();

  return "" + JSON.stringify(z) + JSON.stringify(z2) + JSON.stringify(toCapture1);
};
