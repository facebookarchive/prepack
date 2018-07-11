// does not contain:"99
(function() {
  let a = { 991: -5, a: 1 };
  Object.defineProperty(a, 992, { configurable: false, enumerable: false, writable: true, value: -10 });
  Object.defineProperty(a, "b", { configurable: false, enumerable: false, writable: true, value: 3 });
  let sum = function(a) {
    let res = 0;
    for (let i = 0; i < a.length; i++) res += a[i];
    return res;
  };
  inspect = function() {
    return sum(a) === -11;
  };
})();
