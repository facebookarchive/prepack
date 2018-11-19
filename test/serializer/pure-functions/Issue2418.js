if (!global.__evaluatePureFunction) global.__evaluatePureFunction = f => f();

global.__evaluatePureFunction(function() {
  function EventSubscriptionVendor() {
    this._currentSubscription = null;
  }

  function EventEmitter() {
    this._subscriber = new EventSubscriptionVendor();
  }

  var e = new EventEmitter();
  var havoc = global.__abstract ? global.__abstract("function", "(() => {})") : () => {};
  havoc(() => e.p);

  new EventEmitter();
});
