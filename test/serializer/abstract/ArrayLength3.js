// does contain:[1,, 3,, 5, 6]
(function() {
  let x = global.__abstract ? __abstract("boolean", "true") : true;
  let a = [1, , 3, , 5, 6, , , ,]; // Hole in the middle and end.
  if (x) {
    a.length = 100;
  }
  inspect = function() {
    return a.length;
  };
})();
