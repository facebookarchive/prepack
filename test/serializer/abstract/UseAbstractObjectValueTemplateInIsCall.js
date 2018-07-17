let obj = global.__abstract ? __abstract({}, "obj") : {};
let func = global.__abstract ? __abstract(function() {}, "func") : function() {};
global.result = typeof obj + "/" + typeof func;
global.inspect = function() {
  return global.result;
};
