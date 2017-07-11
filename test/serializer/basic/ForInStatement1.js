(function() {
  let ob = { a: 1, b: 2 };
  let tgt = {};
  for (let p in ob) {
    tgt[p] = p+p;
    break;
  }
  let tgt2 = {};
  let p2;
  xyz: for (p2 in tgt) {
    tgt2[p2] = p2+p2;
    break xyz;
  }
inspect = function() { return tgt.a + tgt2.a; }
})();
