// does not contain:1 + 2
(function() {
  function render1() {
    function render2() {
      return 1 + 2; // This should get prepacked!
    }
    if (global.__optimize) __optimize(render2);
    return render2;
  }

  if (global.__optimize) __optimize(render1);

  global.render1 = render1;
  global.inspect = function() {
    return render1()();
  };
})();
