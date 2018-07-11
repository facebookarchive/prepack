// does not contain:x = 5;
// does not contain:y = 10;

global.z = 100;

function additional1() {
  let x = 5;
  var q = 5;
  return 23;
}

function additional2() {
  var y = 10;
  return z + "bar";
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  let x = additional2();
  let y = additional1();
  return x + y;
};
