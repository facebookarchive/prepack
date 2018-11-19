(function() {
  var f = function(obj) {
    return function() {
      /*This comment will make the function too big to inline*/
      return obj;
    };
  };
  var obj1 = {};
  var obj2 = {};
  var g1 = f(obj1);
  obj1.foo = g1;
  var g2 = f(obj2);
  obj1.bar = g2;
  inspect = function() {
    return JSON.stringify(obj1.foo());
  };
})();
