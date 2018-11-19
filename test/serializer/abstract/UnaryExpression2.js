// throws introspection error

var b = global.__abstract ? global.__abstract("boolean", "true") : true;
var x = global.__abstract ? global.__abstract("number", "123") : 123;
var badOb = {
  valueOf: function() {
    throw 13;
  },
};
var ob = global.__abstract ? global.__abstract("object", "({ valueOf: function() { throw 13;} })") : badOb;
var y = b ? ob : x;
var z;
try {
  z = -y;
} catch (err) {
  z = -err;
}

inspect = function() {
  return "" + z;
};
