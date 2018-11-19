(function() {
  function f() {
    let d = Date.now();
    if (d === 1) {
      return 1;
    } else {
      let e = Date.now();
      if (e === 2) {
        return 2;
      } else if (e === undefined) {
        return 42; /// This used to trigger because e didn't get initialized at the right time!
      } else {
        let f = Date.now();
        if (f === 3) {
          return 3;
        } else {
          return 4;
        }
      }
    }
  }
  if (global.__optimize) __optimize(f);
  inspect = f;
})();
