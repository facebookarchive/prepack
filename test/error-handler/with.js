// recover-from-errors
// expected errors: [{"location":{"start":{"line":8,"column":5},"end":{"line":8,"column":8},"identifierName":"obj","source":"test/error-handler/with.js"},"severity":"FatalError","errorCode":"PP0007"}]

let obj = global.__abstract ? __abstract("object", '({x:1,y:3})') : {x:1,y:3};
if (global.__makeSimple) global.__makeSimple(obj);
let x = 1;
let y = 2;
with(obj) {
  z = x + y;
}
inspect = function() { return z; }
