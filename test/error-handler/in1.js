// recover-from-errors
// expected errors: [{"location":{"start":{"line":9,"column":16},"end":{"line":9,"column":17},"identifierName":"b","source":"test/error-handler/in1.js"},"severity":"RecoverableError","errorCode":"PP0003"}, {"location":{"start":{"line":14,"column":12},"end":{"line":14,"column":13},"identifierName":"b","source":"test/error-handler/in1.js"},"severity":"RecoverableError","errorCode":"PP0003"}]

var b = global.__abstract ? __abstract("boolean", "true") : true;
var p = global.__abstract ? __abstract("string", '("abc")') : "abc";

x1 = "xyz" in {};
try {
  x2 = "xyz" in b;
} catch (err) {
  if (err instanceof TypeError) x2 = true;
}
try {
  x3 = p in b;
} catch (err) {
  if (err instanceof TypeError) x3 = true;
}

inspect = function() {
  return "" + x1 + x3;
};
