let x = global.__abstract ? __abstract("boolean", "true") : true;
let y = global.__abstract ? __abstract("boolean", "false") : false;

var record = []
console.log = function(val) { record.push(val); };

if (x) {
  console.log("true");
} else {
  console.log("false");
}

if (y) {
  console.log("true");
} else {
  console.log("false");
}


inspect = function() { return record.toString(); }
