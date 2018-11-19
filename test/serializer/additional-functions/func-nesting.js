inspect = undefined;
(function() {
  var Super = function Super() {
    this.prop = "bar";
  };

  var ES5Class = (function(superclass) {
    function Foo() {
      superclass.apply(this, arguments);
      this.state = "hello";
    }

    if (superclass) {
      Foo.__proto__ = superclass;
    }
    Foo.prototype = Object.create(superclass && superclass.prototype);
    Foo.prototype.constructor = Foo;
    Foo.prototype.method = function() {
      return " world";
    };

    return Foo;
  })(Super);

  function additional1() {
    return new ES5Class();
  }

  function additional2() {}

  if (global.__optimize) {
    __optimize(additional1);
    __optimize(additional2);
  }

  global.additional1 = additional1;
  global.additional2 = additional2;

  inspect = function inspect() {
    let c1 = additional1();
    let c2 = additional1();
    additional2();

    return "START" + c1 + " " + (c1.prototype === c2.prototype) + " " + (c1.method === c2.method);
  };
})();
