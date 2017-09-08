// additional functions
// does not contain:x = 5;
// does not contain:y = 10;
let toCapture1 = {};

function additional1() {
  toCapture1 = 5;
  var x = 5;
  global.x = x;
}

function additional2() {
  var y = 10;
  global.y = y;
}

inspect = function inspect() {
  let z = toCapture1;
  additional1();
  let z2 = toCapture1;
  additional2();

  //return '' + JSON.stringify(z) + JSON.stringify(z2);
  return "pass";
}
