// does contain:Result-4

let unknownObj = global.__abstract ? __abstract("object", "({})") : {};

function test(fn) {
  let knownObj = { x: 1 };
  let equalityTest = knownObj === unknownObj;
  fn(equalityTest); // This should not havoc the known obj
  return "Result-" + (knownObj.x + 3);
}

if (global.__optimize) {
  __optimize(test);
}

inspect = function() {
  return test(function() {});
};
