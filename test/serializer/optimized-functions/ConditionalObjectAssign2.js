function fn(x, y) {
  var a = x ? y : { a: 2 };

  return Object.assign({}, a, { b: 1 });
}

global.__optimize && __optimize(fn);

inspect = function() {
  let res = JSON.stringify({ x: fn(true, { x: 5 }), y: fn(false, { x: 4 }) });
  // This is done because Prepack re-orders the keys on the object, which affects
  // JSON.stringify output with V8 as keys are output in the order they're inserted
  // and the output will mismatch even though the objects are the same.
  let expected = `{"x":{"x":5,"b":1},"y":{"b":1,"a":2}}`;
  let expectedKeysOrderer = `{"x":{"x":5,"b":1},"y":{"a":2,"b":1}}`;
  return res === expected || res === expectedKeysOrderer;
};
