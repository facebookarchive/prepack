// does not contain:undefined
(function() {
  x = undefined;
  inspect = function() { return x; }
})();