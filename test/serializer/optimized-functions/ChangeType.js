function fn2(cond, arr) {
  if (cond) {
    var length = arr.length;
    global.__changeType ? global.__changeType(length, "number") : 5;
    return length;
  }
  return 0;
}

function fn(cond, arr1, arr2) {
  var len = fn2(cond, arr1);
  var len2 = fn2(cond, arr2);

  if (len > 0) {
    var toString = global.__abstract ? __abstract("string", "template:(A).toString()", { args: [len] }) : len.toString();
    return toString;
  }
  if (len2 > 0) {
    var toString = global.__abstract ? __abstract("string", "template:(A).toString()", { args: [len] }) : len.toString();
    return toString;
  }
  return "Should not hit this!";
}

this.__optimize && __optimize(fn);

inspect = function() {
  return fn(true, [], []);
}