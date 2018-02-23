// does not contain:x = 5;
// add at runtime: x = 3;
var x;
if (global.__abstract) x = __abstract("number");
else x = 3;

function func1() {
  if (x > 10)
    throw new Error("X greater than 10 " + x);
  return x;
}

if (global.__registerAdditionalFunctionToPrepack)
  __registerAdditionalFunctionToPrepack(func1);

inspect = function() {
  let error;
  try {
    func1(11);
  } catch (e) {
    error = e.message;
  }
  return error + ' okay value: ' + func1(5);
}
