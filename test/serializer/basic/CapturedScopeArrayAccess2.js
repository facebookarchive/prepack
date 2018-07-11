// does not contain: superLongName
(function() {
  function g(i) {
    let superLongName1 = 1;
    let superLongName2 = 2;
    let superLongName3 = 3;
    let g1 = function() {
      return superLongName1++ + superLongName2++;
    };
    let g2 = function() {
      return superLongName2++ + superLongName3++;
    };
    return i === 1 ? g1 : g2;
  }
  let f1 = g(1);
  let f2 = g(2);
  inspect = function() {
    return f1() + f2();
  };
})();
