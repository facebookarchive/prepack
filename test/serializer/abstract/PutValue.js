// throws introspection error
var i = 42;
i.someProperty = 43;

var obj = __makePartial({});
obj.someProperty = 42;
