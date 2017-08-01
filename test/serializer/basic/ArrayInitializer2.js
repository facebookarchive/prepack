// does contain:[11, 22, 33]
(function() {
  let o = [11, 22];
  o["2"] = 33;      // Index property.
  o["010"] = 42;    // None-index property.
  inspect = function() { return o; }
})();
