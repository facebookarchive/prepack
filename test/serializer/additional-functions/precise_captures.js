(function() {
  function Bar() {
    return 123;
  }

  function Foo() {
    return Bar();
  }

  if (global.__optimize) __optimize(Foo);

  global.Foo = Foo;

  inspect = function() {
    return Foo();
  };
})();
