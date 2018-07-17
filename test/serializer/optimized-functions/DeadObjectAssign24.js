// Copies of _\$D\(:1
// Copies of var _\$D = _\$C.assign;:1
// inline expressions

// _$C is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function fn(obj, x) {
  var a = Object.assign({}, x, { a: 1 });
  var b = Object.assign({}, x, { b: 1 });

  if (obj.cond) {
    var c = Object.assign({}, a, b, a);

    return c.a + c.b;
  }
}

this.__optimize && __optimize(fn);

inspect = function() {
  return fn(
    {
      cond: true,
    },
    { a: 0, b: 0 }
  );
};
