// skip lazy objects
// Copies of default: 2
(function() {
  var a = { default: 1, foo: 11 };
  var b = { default: 2, foo: 12 };
  var c = { default: 3, foo: 13 };
  var d = { default: 4, foo: 14 };
  var e = { default: 5, foo: 15 };
  var heap = [a, a, b, b, c, c, d, d, e, e];
  inspect = function() {
    return heap[0]["default"];
  };
})();
