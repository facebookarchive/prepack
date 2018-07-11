// does not contain: {}
let x = global.abstract ? __abstract(undefined, "5") : 5;
let xIsNull = x == null;
let y = xIsNull ? null : {};
if (y) global.result = true;

inspect = function() {
  return global.result;
};
