// does not contain:infeasible
(function() {
  let c = global.__abstract ? __abstract("boolean", "(true)") : true;
  let left = c ? 0 : 10;
  let right = c ? 5 : 15;
  let infeasible = left > right;
  if (infeasible) throw new Error("infeasible!");
  inspect = function() {
    return infeasible;
  };
})();
