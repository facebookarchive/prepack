let b = global.__abstract ? __abstract("boolean", "true") : true;
let n1;
if (b) n1 = 5;
let n2 = global.__abstract ? __abstract("number", "7") : 7;
var x = 0;
function f() {
  if (!b) return;
  if (b) throw "foo";
  //dead
  x = 42;
}

inspect = function() {
  return f();
};
