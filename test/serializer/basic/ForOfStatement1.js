(function() {
  function foo() {
    return eval(`
      let ob = [1, 2];
      xyz: for (const p of ob) {
        let p2;
        for (p2 of ob) {
          if (p === 1) continue xyz;
          p2;
          break xyz;
        }
      }`);
  }
  for (var p0 of [1]) {
    /*empty*/
  }
  let bar = foo();
  let tgt = {};
  for (let [p2 = "pp"] of [[undefined]]) {
    tgt[p2] = "tpp";
  }
  let p3;
  for ({ p3 = "ppp" } of [{}]) {
    tgt[p3] = "tppp";
  }
  for (var p4 of [1, 2]) {
    tgt["p4"] = p4;
  }
  for (var { p5 = "pppp" } of [{}]) {
    tgt[p5] = "tpppp";
    break;
  }
  try {
    for (var { p6 = null.nonsense } of [{}]) {
      tgt[p6] = "tppppp";
    }
  } catch (e) {
    tgt["e"] = e.constructor.name;
  }
  try {
    for (null.p7 of [{}]) {
      tgt[p7] = "tpppp";
    }
  } catch (e) {
    tgt["ee"] = e.constructor.name;
  }
  (function() {
    for (var p8 in [1]) {
      return;
    }
  })();
  inspect = function() {
    return bar + tgt.pp + tgt.ppp + tgt.p4 + tgt.p5 + tgt.e + tgt.ee;
  };
})();
