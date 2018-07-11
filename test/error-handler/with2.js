// recover-from-errors
// expected errors: [{"location":{"start":{"line":6,"column":6},"end":{"line":6,"column":9},"identifierName":"obj","source":"test/error-handler/with2.js"},"severity":"RecoverableError","errorCode":"PP0007"}, {"location":{"start":{"line":7,"column":2},"end":{"line":7,"column":3},"identifierName":"z","source":"test/error-handler/with2.js"},"severity":"FatalError","errorCode":"PP0001"}]

let obj = global.__abstract ? __makePartial({ x: 1, y: 3 }, "({x:1,y:3})") : { x: 1, y: 3 };
let y = 2;
with (obj) {
  z = x + y;
}
inspect = function() {
  return z;
};
