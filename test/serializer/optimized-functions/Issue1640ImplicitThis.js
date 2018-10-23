(function() {
  function f(x) {
    this.x = 5 + x;
    var self = this;
    this.doSomething = function(y) {
      return self.x + y;
    };
  }

  if (global.__optimize) __optimize(f);

  global.inspect = function() {
    var obj = new f(10);
    return obj.doSomething(20);
  };
})();
