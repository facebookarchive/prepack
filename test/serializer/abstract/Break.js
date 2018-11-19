let x = global.__abstract ? __abstract("boolean", "true") : true;

let arr = [];

xyz: while (true) {
  arr[0] = 123;
  if (x) break xyz;
  else break xyz;
}

var z = arr;

inspect = function() {
  return "" + z;
};
