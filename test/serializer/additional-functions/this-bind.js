(function() {
  function f(x) {
    this.x = 5 + x;
    this.doSomething = function(y) {
      return this.x + y;
    }.bind(this);
  }

  if (global.__optimize) __optimize(f);

  global.inspect = function() {
    var obj = new f(10);
    return obj.doSomething(20);
  };

})();