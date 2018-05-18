// does not contain:.fakeB;
(function() {
  function URI() {}

  function parse(alwaysNull, alwaysString) {
    if (!alwaysString) {
      return;
    }
    if (alwaysString instanceof URI) {
      alwaysString.fakeA();
    }
    var derivedString = alwaysString.trim();
    if (derivedString.fakeB()) {
      return;
    }
    try {
      alwaysNull.fakeC();
    } catch (err) {}
  }

  function f(arg) {
    var unknownString = "" + arg;
    parse(null, unknownString);
    new URI(unknownString);
  }

  if (global.__optimize) __optimize(f);

  global.inspect = function() {
    try {
      f("a");
    } catch (err) {
      if (err.message.endsWith("fakeB is not a function")) {
        return "ok";
      } else {
        return err.message;
      }
    }
    throw new Error("Expected to throw.");
  };
})();
