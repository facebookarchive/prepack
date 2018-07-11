function call(fn) {
  var template = {};
  if (global.__makeSimple) global.__makeSimple(template);
  function residualCall(fn) {
    var value;
    var exception;
    var success = true;
    try {
      value = fn();
    } catch (e) {
      exception = e;
      success = false;
    }
    return { value, exception, success };
  }
  var res = global.__residual ? global.__residual(template, residualCall, fn) : residualCall(fn);
  if (!res.success) {
    throw res.exception;
  }
  return res.value;
}

var fn = global.__abstract ? global.__abstract("function", "(function () { })") : function() {};

var x = 1;
try {
  call(fn);
  x = 2;
  //call(fn);
  x = 3;
} catch (err) {}

inspect = function() {
  return x;
};
