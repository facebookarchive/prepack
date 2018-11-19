function URI(uri) {
  this.a = "";
  var b = bar(uri) || {};
  if (b.foo && b.foo()) {
    throw new Error("foo");
  }
  this.a = b;
  return this;
}

function bar(uri) {
  var str = "";
  if (uri.a) {
    str += uri.a;
  }
  return str;
}

function fn(arg) {
  new URI(new URI(arg));
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  try {
    fn({ a: "hello" });
    return "ok";
  } catch (err) {
    return err;
  }
};
