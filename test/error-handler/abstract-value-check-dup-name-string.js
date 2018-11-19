// expected errors: [{"location": {"start":{"line":4,"column":0},"end":{"line":4,"column":27},"source":"test/error-handler/abstract-value-check-dup-name-string.js"},"severity":"FatalError","errorCode":"PP0019","message":"An abstract value with the same name exists"}]

__abstract("number", "foo");
__abstract("number", "foo");
