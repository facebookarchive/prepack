// recover-from-errors
// expected errors: [{location: {"start":{"line":17,"column":14},"end":{"line":17,"column":16 },"identifierName":"n1","source":"test/error-handler/conditional-return.js"}, errorCode: "PP0002", severity: "RecoverableError", message: "might be an object with an unknown valueOf or toString or Symbol.toPrimitive method"}]
let b = global.__abstract ? __abstract("boolean", "true") : true;
let n1;
if (b) n1 = 5;
let n2 = global.__abstract ? __abstract("number", "7") : 7;

function f() {
  if (!b) return;
  // should not fail
  return n2 - n1;
}

function g() {
  f();
  //condition from line 7 should have been undone and this should fail.
  return n2 - n1;
}

g();

inspect = function() {
  return true;
};
