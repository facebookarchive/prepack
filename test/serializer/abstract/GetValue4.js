// throws introspection error
let x = __abstract("boolean", "true");
let ob = x
  ? { a: 1 }
  : {
      get a() {
        return 2;
      },
    };
let y = ob.a;
