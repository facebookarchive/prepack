// Tests that code with heapgraph enabled doesn't crash.
// Regression test for issue #1732.

// heapGraphFilePath

(function () {
    let a = global.__abstract ? __abstract("number", "5") : 5;
    let b, c;
    global.f = function() {
      b = a + 42;
      c = a + 42;
      return b;
    }
    global.__optimize && __optimize(f);
    
})();

inspect = function() { return global.f(); }