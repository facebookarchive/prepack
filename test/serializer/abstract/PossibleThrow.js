let x = global.__abstract ? __abstract("boolean", "true") : true;
let y;
try {
  if (x) {
    y = 1;
    throw Error();
  } else {
    y = 0;
  }
} catch (e) {}

inspect = function() {
  return y;
};
