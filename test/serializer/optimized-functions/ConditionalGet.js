// inline expressions
// Copies of \{\}:0
// Copies of = 2:0

function fn(x, b) {
  var a = x ? b : { a: 2 };
  return a.a;
}

this.__optimize && __optimize(fn);

inspect = function() {
  return fn(false, { a: 1 });
};
