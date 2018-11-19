var x = global.__abstract ? (x = __abstract("boolean", "true")) : true;

function foo() {
  let ob = {};
  if (!x) ob.bar = 123;
  return ob.bar;
}

if (global.__optimize) __optimize(foo);

inspect = function() {
  return foo();
};
