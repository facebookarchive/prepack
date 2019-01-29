// omit invariants
// Copies of if \(:2
var x = global.__abstract ? __abstract("boolean", "x") : "x";
var y = global.__abstract ? __abstract("boolean", "y") : "y";

if (x) {
  console.log("Hello World!");
}

if (x && y) {
  console.log("Hello");
}

if (x && y) {
  console.log(" World!");
}
