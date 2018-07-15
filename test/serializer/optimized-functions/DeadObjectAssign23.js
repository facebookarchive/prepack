// Copies of _\$C\(:2
// Copies of var _\$C = _\$B.assign;:1
// inline expressions

// _$C is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function fn2(obj, x) {
  return Object.assign({}, x, { a: 1 });
}

function fn3(obj, x) {
  return Object.assign({}, x, { b: 1 });
}

function fn(obj, x) {
  var a = fn2(obj, x);
  var b = fn3(obj, x);

  if (obj.cond3) {
    var c = Object.assign({}, a, b);

    return c.a + c.b;
  }
}

this.__optimize && __optimize(fn);

inspect = function() {
  return fn({
    cond1: false,
    cond2: false,
    cond3: true,
  }, { a: 0, b: 0 })
}
