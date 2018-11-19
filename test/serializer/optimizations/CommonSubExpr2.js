var x = global.__abstract ? __abstract("number", "1") : 1;
var y = global.__abstract ? __abstract("number", "2") : 2;

var useFoo = true;

function foo(v) {
  if (v > 2) {
    return "hello";
  } else {
    return "world";
  }
}

let a;
if (x > 100) {
  if (useFoo) {
    a = foo(y);
  } else {
    a = x;
  }
} else {
  a = foo(y);
}
result = a;

inspect = function() {
  return global.result;
};
