// omit invariants
// Copies of if \(:2
var x = global.__abstract ? __abstract("boolean", "x") : "x";

if (x) {
  console.log("Hello");
}

if (x) {
  console.log(" World");
}

if (x) {
  console.log("!");
}

if (!x) {
  console.log("Hello World!");
}
