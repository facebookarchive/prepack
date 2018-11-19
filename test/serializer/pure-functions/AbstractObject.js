let c = global.__abstract ? __abstract("boolean", "(true)") : true;

function test(fn) {
  let knownObj = { x: 1 };
  let knownObj2 = { y: 3 };
  let conditionalObj = c ? knownObj : knownObj2;
  fn(conditionalObj); // This must havoc both known objects
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
