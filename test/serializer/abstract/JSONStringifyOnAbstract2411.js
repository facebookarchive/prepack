// throws introspection error
//
(function() {
  let o = __abstract("object", "(o)");
  let s;
  s = "A" + JSON.stringify(o);

  global.s = s;
})();
