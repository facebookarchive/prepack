function fn2(cond, obj) {
  if (cond) {
    return obj.x;
  }
  return false;
}

function fn(cond, obj1, obj2) {
  var res1 = fn2(cond, obj1);
  var res2 = fn2(cond, obj2);

  if (res1 > 0) {
    return res1.toString();
  }
  if (res2 > 0) {
    return res1.toString();
  }
  return null;
}

var cond = global.__abstract ? __abstract("boolean", "(false)") : false;
var obj1 = global.__abstract
  ? __abstract({ x: global.__abstract ? __abstract("boolean", "obj1.x") : false }, "({ x: false })")
  : { x: false };

var obj2 = global.__abstract
  ? __abstract({ x: global.__abstract ? __abstract("boolean", "obj2.x") : false }, "({ x: false  })")
  : { x: false };

var result = fn(cond, obj1, obj2);
