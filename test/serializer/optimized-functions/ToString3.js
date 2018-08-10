// inline expressions

function fn(cond, cond2, a, b, c) {
  var x = global.__abstract ? __abstract("number", "a") : a;
  var y;
  var z;
  var obj = Object.assign({}, b, { x });

  if (cond) {
    y = obj.x.toString() + c;
    z = y.split("");
  } else {
    if (cond2) {
      return null;
    }
    y = obj.x.toString() + " " + c;
    z = y.split("");
  }
  return z;
}

inspect = function() {
  return fn(false, false, 2, {}, 5);
};

this.__optimize && __optimize(fn);
