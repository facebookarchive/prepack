// recover-from-errors
// expected errors: [{"location":{"start":{"line":7,"column":6},"end":{"line":7,"column":9},"identifierName":"obj","source":"test/error-handler/with.js"},"severity":"RecoverableError","errorCode":"PP0007"}]

let obj = global.__abstract ? __makePartial({ x: 1, y: 3 }, "({x:1,y:3})") : { x: 1, y: 3 };
if (global.__makeSimple) global.__makeSimple(obj);
let y = 2;
with (obj) {
  z = x + y;
}
inspect = function() {
  return z;
};
