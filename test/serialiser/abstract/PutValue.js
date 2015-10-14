// throws introspection error
var i = 42;
i.someProperty = 43;

var obj = __abstract({});
obj.someProperty = 42;
