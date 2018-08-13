let x = global.__abstract ? __abstract("boolean", "true") : true;
let arr = [];

function foo() {
  xyz: while (true) {
    arr[0] = 123;
    if (x) break;
    else break xyz;
  }
}

var z = foo();

inspect = function() {
  return z;
};
