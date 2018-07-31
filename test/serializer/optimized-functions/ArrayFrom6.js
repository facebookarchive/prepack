function add(a, b) {
  return a + b;
}

function fn(x) {
  var arr = Array.from(x);
  return arr.map(function(item) {
    return add(item.a, item.b);
  });
}

this.__optimize && __optimize(fn);