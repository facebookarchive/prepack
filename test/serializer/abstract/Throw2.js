// does not contain:setPrototypeOf
let x = global.__abstract ? __abstract("boolean", "true") : true;

var z;
try {
  if (x) throw new Error("is true");
  z = "is false";
} catch (e) {
  z = e;
}

inspect = function() {
  return z;
};
