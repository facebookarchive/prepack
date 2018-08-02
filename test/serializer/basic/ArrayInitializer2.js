// does contain:[11,, 333, 44]
(function() {
  let o = [11, 22, 33, 44];
  o["2"] = 333; // Index property.
  delete o[1];
  o["010"] = 42; // None-index property.
  inspect = function() {
    return o;
  };
})();
