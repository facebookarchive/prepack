// Copies of if :2
// Copies of console:3
let x = global.__abstract ? __abstract("boolean", "true") : true;
let y = global.__abstract ? __abstract("boolean", "false") : false;

if (x) {
  console.log("Hello World!");
}

if (x && !y) {
  console.log("Hello");
}

if (x && !y) {
  console.log(" World!");
}
