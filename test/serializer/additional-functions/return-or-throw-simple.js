// does not contain:x = 5;

function func1(x) {
  if (x > 10) throw new Error("Value greater than 10: " + x);
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
