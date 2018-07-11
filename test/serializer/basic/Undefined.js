// does not contain:undefined
// omit invariants
(function() {
  var x = undefined;
  inspect = function() {
    return x;
  };
})();
