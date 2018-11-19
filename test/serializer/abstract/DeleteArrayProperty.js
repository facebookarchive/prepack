var x = global.__abstract ? __abstract("boolean", "true") : true;
var o = [42];
if (x) delete o[0];
inspect = function() {
  return o[0];
};
