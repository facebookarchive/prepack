// abstract effects
// expected errors: [{location: {"start":{"line":30,"column":11},"end":{"line":30,"column":21},"identifierName":"abstractFn","source":"test/error-handler/try-and-call-abstract-function.js"}, errorCode: "PP0021", severity: "RecoverableError", message: "Possible throw inside try/catch is not yet supported"}]
// recover-from-errors

let abstractFn = global.__abstract
  ? __abstract("function", "(function() { return true; })")
  : function() {
      return true;
    };

function concreteFunction() {
  return true;
}

function additional1() {
  let value;
  try {
    // This is ok.
    value = concreteFunction();
  } catch (x) {
    value = false;
  }
  // This is ok.
  return abstractFn(value);
}

function additional2() {
  try {
    // This is not ok.
    return abstractFn();
  } catch (x) {
    return false;
  }
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  let ret1 = additional1();
  let ret2 = additional2();
  return JSON.stringify({ ret1, ret2 });
};
