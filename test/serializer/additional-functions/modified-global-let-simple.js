// additional functions
let x = undefined;
global.additional1 = function() {
  x = {};
  return 4;
}

global.additional2 = function() {
  return 20;
}

inspect = function() {
  let prevX = x;
  additional1();
  return "" + prevX + " " + x;
}
