// Copies of default: 2
(function() {
  var a = {"default": 1};
  var b = {"default": 2};
  var c = {"default": 3};
  var d = {"default": 4};
  var e = {"default": 5};
  heap = [a,a,b,b,c,c,d,d,e,e];
  inspect = function() { return heap[0]["default"]; }
})();
