// skip lazy objects
// Copies of property: 2
// omit invariants
(function() {
  var a = { property: 1 };
  var b = { property: 2 };
  var c = { property: 3 };
  var d = { property: 4 };
  var e = { property: 5 };
  var heap = [a, a, b, b, c, c, d, d, e, e];
  inspect = function() {
    return heap[0]["property"];
  };
})();
