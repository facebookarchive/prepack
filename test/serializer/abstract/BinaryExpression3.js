var b = global.__abstract ? __abstract("boolean", "true") : true;
var x = global.__abstract ? __abstract("number", "123") : 123;
var ob = {
  valueOf: function() {
    throw 13;
  },
};
var y = b ? ob : x;

var z;
try {
  z = 100 + y;
} catch (err) {
  z = 200 + err;
}

inspect = function() {
  return "" + z;
};
