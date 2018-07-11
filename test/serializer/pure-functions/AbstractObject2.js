let c = global.__abstract ? __abstract("boolean", "(true)") : true;
let unknownObj = global.__abstract ? __abstract("object", "({})") : {};

function test(fn) {
  let knownObj = { x: 1 };
  let conditionalUnknownObj = c ? knownObj : unknownObj;
  fn(conditionalUnknownObj); // This must havoc the known obj
  return "Result-" + (knownObj.x + 3);
}

if (global.__optimize) {
  __optimize(test);
}

inspect = function() {
  return test(function(o) {
    o.x++;
  });
};
