(function () {
  var pending_invalidate = [];
  var next_id = 1;

  var Context = function () {
    // Each context has a unique number. You can use this to avoid
    // storing multiple copies of the same context in your
    // invalidation list. The id is an integer >= 1.
    this.id = next_id++;
    this._callbacks = [];
    this._invalidated = false;
  };
  Context.current = null;
  Context.logInvalidateStack = false;

  _.extend(Context.prototype, {
    run: function (f) {
      var previous = Context.current;
      Context.current = this;
      try { var ret = f(); }
      finally { Context.current = previous; }
      return ret;
    },

    // we specifically guarantee that this doesn't call any
    // invalidation functions (before returning) -- it just marks the
    // context as invalidated.
    invalidate: function () {
      if (!this._invalidated) {
        this._invalidated = true;
        // If this is first invalidation, schedule a flush.
        // We may be inside a flush already, in which case this
        // is unnecessary but harmless.
        if (!pending_invalidate.length)
          setTimeout(Meteor.flush, 0);
        pending_invalidate.push(this);
      }
    },

    // calls f immediately if this context was already
    // invalidated. receives one argument, the context.
    on_invalidate: function (f) {
      if(Context.logInvalidateStack) {
        Error.stackTraceLimit = 100;
        if (!f.errs) f.errs = [];
        f.errs.push(new Error);
        Error.stackTraceLimit = 10;
      }
  
      if (this._invalidated)
        f(this);
      else
        this._callbacks.push(f);
    }
  });

  _.extend(Meteor, {
    // XXX specify what happens when flush calls flush. eg, flushing
    // causes a dom update, which causes onblur, which invokes an
    // event handler that calls flush. it's probably an exception --
    // no flushing from inside onblur. can also imagine routing onblur
    // through settimeout(0), which is probably what the user wants.
    // https://app.asana.com/0/159908330244/385138233856
    flush: function () {
      while (pending_invalidate.length) {
        var pending = pending_invalidate;
        pending_invalidate = [];

        _.each(pending, function (ctx) {
          _.each(ctx._callbacks, function (f) {
            if(Context.logInvalidateStack) {
              _.each(f.errs, function(err) {
                printUserStack(err.stack);
              });
            }
            f(ctx); // XXX wrap in try?
          });
          delete ctx._callbacks; // maybe help the GC
        });
      }
    },

    deps: {
      Context: Context
    }
  });

  function printUserStack(stack) {
  //console.log(stack);
    var re = /[^\(]*\((.*)\)/
    var lines = stack.split('\n');
    var userLines = _.filter(lines, function(line) {
      var file = re.exec(line);
      if(file && file[1] !== 'native') {
        var parsed = utils.parseUrl(file[1]);
        var parts = parsed.pathname.split('/');
        if(parts[1] !== 'packages') {
          //console.log(parsed.pathname);
          return true;
        }// else
         // console.log(parsed.pathname);
      }
      //var url = utils.parseUrl(file[0]);
      //console.log(url);
      return false;
    });

    userLines.length > 0 && console.log(userLines.join('\n'));
  }
})();
