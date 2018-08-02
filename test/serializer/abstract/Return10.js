// Copies of 42:1

(function() {
  x = global.__abstract ? __abstract("number", "5") : 5;
  if (x == 5) {
    console.log("42");
  } else {
    return;
  }
})();
