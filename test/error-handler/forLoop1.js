// expected errors: [{"location":{"start":{"line":9,"column":17},"end":{"line":9,"column":32},"source":"test/error-handler/forLoop1.js"},"severity":"FatalError","errorCode":"PP0034"}]

var x = global.__abstract ? (x = __abstract("number", "(1)")) : 1;
let i;
let j;

label: for (i = 0; i < 2; i++) {
  for (j = 0; j < 2; j++) {
    if (i === x) continue label;
  }
}

inspect = function() {
  return j;
};
