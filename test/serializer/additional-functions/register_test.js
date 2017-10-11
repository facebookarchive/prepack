// does not contain:x = 5;

function func1() {
  let x = 5;
  global.z = x;
  return global.z;
}

function func2() {
  let x = 5;
  global.y = x;
  return global.y;
}

if (global.__registerAdditionalFunctionToPrepack) {
  __registerAdditionalFunctionToPrepack(func1);
  __registerAdditionalFunctionToPrepack(func2);
}

inspect = function() {
  return func1() + func2();
}
