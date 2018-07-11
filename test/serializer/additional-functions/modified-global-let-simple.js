let x = undefined;
global.additional1 = function() {
  x = {};
  return 4;
};

global.additional2 = function() {
  return 20;
};

if (global.__optimize) {
  global.__optimize(additional1);
  global.__optimize(additional2);
}

inspect = function() {
  let prevX = x;
  global.additional1();
  return "" + prevX + " " + x;
};
