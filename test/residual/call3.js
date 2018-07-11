var o = global.__abstract ? global.__abstract("number", "1") : 1;
var obj = {};
function bar(x) {
  if (o > 1) {
    obj.foo = function() {
      return 1 + x;
    };
  } else if (o > 2) {
    obj.foo = function() {
      return 2 + x;
    };
  } else {
    obj.foo = function() {
      return 3 + x;
    };
  }
}
bar(5);
__result = obj.foo();
