// Add 3 functions to an object to create a reactive variable on it.
//
// For example Router.add_reactive_variable('current_page', initial_value) will create three methods:
//
//   - Router.current_page(not_reactive = false): 
//      reads the value of current_page, reactively?
// 
//   - Router.current_page.equals(value): 
//      is current_page === value ala the session
//
//   - Router.current_page.set(value): 
//      changes the value of current_page, reactively
//       (i.e. invalidates all contexts that have read this variable)
Meteor.deps.add_reactive_variable = function(object, name, value) {
  // the variable is hidden via closures
  var variable = value;
  var contexts = {}, equals_contexts = {};
  
  object[name] = function(not_reactive) {
    if (not_reactive) 
      return variable;
    
    var context = Meteor.deps.Context.current;
    
    if (context && !(context.id in contexts)) {
      contexts[context.id] = context;
      context.on_invalidate(function () {
        delete contexts[contexts.id];
      });
    }
    
    return variable;
  };
  
  object[name].equals = function(value) {
    var context = Meteor.deps.Context.current;
    if (context) {
      if (!(value in equals_contexts))
        equals_contexts[value] = {};
      
      if (!(context.id in equals_contexts[value])) {
        equals_contexts[value][context.id] = context;
        context.on_invalidate(function () {
          delete equals_contexts[value][context.id];

          // clean up [key][value] if it's now empty, so we don't use
          // O(n) memory for n = values seen ever
          for (var x in equals_contexts[value])
            return;
          delete equals_contexts[value];
        });
      }
    }
    
    return variable === value;
  };
  
  object[name].set = function(new_value) {
    var old_value = variable;
    if (new_value === old_value)
      return;
    
    variable = new_value;
    
    var invalidate = function (map) {
      if (map)
        for (var id in map)
          map[id].invalidate();
    };
    
    invalidate(contexts);
    invalidate(equals_contexts[old_value]);
    invalidate(equals_contexts[new_value]);
  };
};

// listen to a reactive fn until it returns true, at which point, call callback.
//
// Example (continuing from above): 
//   Meteor.deps.await(function() { Router.current_page_equals('home'); }, function() { console.log('at home'); });
Meteor.deps.await = function(test_fn, callback) {
  var done = false
  var context = new Meteor.deps.Context()
  context.on_invalidate(function() {
    if (!done)
      Meteor.deps.await(test_fn, callback);
  });
    
  context.run(function() {
    if (test_fn()) {
      done = true;
      callback();
    }
  });
};
