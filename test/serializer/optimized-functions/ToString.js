// does not contain:.toString()
function fn(someString) {
  var x = global.__abstract ? __abstract("string", "someString") : someString;

  return x.toString();
}

inspect = function() {
  return fn("Hello world");
};

this.__optimize && __optimize(fn);
