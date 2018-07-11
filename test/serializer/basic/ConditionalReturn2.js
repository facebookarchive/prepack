let b = global.__abstract ? global.__abstract("boolean", "(true)") : true;
let b1 = global.__abstract ? global.__abstract("boolean", "((true))") : true;
let n1;
if (!b1) n1 = 5;
let n2 = global.__abstract ? __abstract("number", "7") : 7;

function f() {
  if (b) {
    if (b1) {
      return;
    }
  } else return;

  return n2 - n1;
}

// should be undefined
inspect = function() {
  return f();
};
