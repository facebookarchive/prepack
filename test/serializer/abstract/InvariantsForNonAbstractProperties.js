// add at runtime:global.a = {p: 42, q: global, r: function() {}};
// Count of Prepack model invariant violation:5
(function() {
  if (global.__assumeDataProperty)
    __assumeDataProperty(global, "a", __abstract({ p: 42, q: global, r: function() {}, s: undefined }));
  global.ap = a.p;
  global.aq = a.q;
  global.ar = a.r;
  global.as = a.s;
  inspect = function() {
    return global.ap;
  };
})();
