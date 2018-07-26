function fn2(cond, arr) {
  if (cond) {
    var length = arr.length;
    global.__changeType && __changeType(length, "number");
    return length;
  }
  return 0;
}

function fn(cond, arr1, arr2) {
  var len = fn2(cond, arr1);
  var len2 = fn2(cond, arr2);

  if (len > 0) {
    var toString = __abstract("string", "template:(A).toString()", { args: [len] })
    return toString;
  }
  if (len2 > 0) {
    var toString = __abstract("string", "template:(A).toString()", { args: [len] })
    return toString;
  }
  return "Should not hit this!";
}

this.__optimize && __optimize(fn);

inspect = function() {
  return fn(true, [], []);
}