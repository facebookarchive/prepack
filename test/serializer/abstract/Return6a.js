let x = global.__abstract ? __abstract("number", "(1)") : 1;

let i = 0;

function f() {
  if (i === x) return 10;
  i++;
  if (i === x) return 11;
  i++;
}

f();

inspect = function() {
  return i;
};
