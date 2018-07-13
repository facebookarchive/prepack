let c1 = global.__abstract ? __abstract("boolean", "true") : true;
let c2 = global.__abstract ? __abstract("boolean", "false") : false;

function foo(cond) {
  if (cond) throw "I am an error too!";
}

if (c2) {
  foo(c1);
}

inspect = function() {
  return "success";
};
