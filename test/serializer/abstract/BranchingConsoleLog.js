let x = global.__abstract ? __abstract("boolean", "true") : true;
let y = global.__abstract ? __abstract("boolean", "false") : false;

if (x) {
  console.log("true");
} else {
  console.log("false");
}

if (y) {
} else {
  console.log("false");
}

inspect = function() {
  return "";
};
