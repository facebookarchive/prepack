// does not contain:undefined
// omit invariants
(function() {
  x = undefined;
  inspect = function() { return x; }
})();