(function() {

  Meteor._partials = {};

  // XXX Handlebars hooking is janky and gross

  Meteor._hook_handlebars = function () {
    Meteor._hook_handlebars = function(){}; // install the hook only once

    var orig = Handlebars._default_helpers.each;
    Handlebars._default_helpers.each = function (arg, options) {
      // if arg isn't an observable (like LocalCollection.Cursor),
      // don't use this reactive implementation of #each.
      if (!(arg && 'observe' in arg))
        return orig.call(this, arg, options);

      return Spark.list(
        arg,
        function (item) {
          return Spark.labelBranch(
            item._id || Spark.UNIQUE_LABEL, function () {
              var html = Spark.isolate(_.bind(options.fn, null, item));
              return Spark.setDataContext(item, html);
            });
        },
        function () {
          return options.inverse ?
            Spark.isolate(options.inverse) : '';
        }
      );
    };

    _.extend(Handlebars._default_helpers, {
      isolate: function (options) {
        var data = this;
        return Spark.isolate(function () {
          return options.fn(data);
        });
      },
      constant: function (options) {
        var data = this;
        return Spark.createLandmark({ constant: true }, function () {
          return options.fn(data);
        });
      }
    });
  };

  // map from landmark id, to the 'this' object for
  // created/rendered/destroyed callbacks on templates
  var templateInstanceData = {};

  //setup migration for template stores
  var templateStoresByPath = {};
  if (Meteor._reload) {
    Meteor._reload.on_migrate('templateStores',function() {
      var stores = {}
      _.each(templateInstanceData,function(template) {
        stores[template._id()] = template.store;
      });
      return [true,stores];
    });
    (function() {
      var migration_data = Meteor._reload.migration_data('templateStores');
      if (migration_data) {
        templateStoresByPath = migration_data;

        // should delete all template stores after first render ?
        
      }
    })();
  }

  var templateObjFromLandmark = function (landmark) {
    var template = templateInstanceData[landmark.id] || (
      templateInstanceData[landmark.id] = {
        // set these once
        find: function (selector) {
          if (! landmark.hasDom())
            throw new Error("Template not in DOM");
          return landmark.find(selector);
        },
        findAll: function (selector) {
          if (! landmark.hasDom())
            throw new Error("Template not in DOM");
          return landmark.findAll(selector);
        },

        store: ReactiveDict(),

        _id: function() {
          if ($(this.firstNode).attr('id')) return $(this.firstNode).attr('id');
          else {
            return "/" + $(this.firstNode).parents().andSelf().map(function() {
              var $this = $(this);
              var tagName = this.nodeName;
              if ($this.siblings(tagName).length > 0) {
                  tagName += "[" + $this.prevAll(tagName).length + "]";
              }
              return tagName;
            }).get().join("/");
          }
          
        },

        set: function(key, value, notReactive) {
          return this.store.set(key, value, notReactive);
        },

        get: function(key) {
          return this.store.get(key);
        },

        emitter: new Emitter(),

        nextRender: function(cb) {
          this.emitter.once('render',cb);
        },

        emitRender: function() {
          this.emitter.emit('render');
        },

        onRender: function(cb) {
          this.emitter.on('render',cb);
        },

        onDestroy: function(cb) {
          this.emitter.on('destroy',cb);
        },

        emitDestroy: function() {
          this.emitter.emit('destroy');
        },

        firstRender: true,

      });
    // set these each time
    template.firstNode = landmark.hasDom() ? landmark.firstNode() : null;
    template.lastNode = landmark.hasDom() ? landmark.lastNode() : null;
    return template;
  };

  Meteor.templateFromLandmark = templateObjFromLandmark;
  Meteor.templatesById = {}
  Meteor.templatesByIdCallbacks = {};

   // XXX forms hooks into this to add "bind"?
  Meteor._template_decl_methods = {
    // methods store data here (event map, etc.).  initialized per template.
    _tmpl_data: null,
    // these functions must be generic (i.e. use `this`)
    events: function (eventMap) {
      var events =
            (this._tmpl_data.events = (this._tmpl_data.events || {}));
      _.extend(events, eventMap);
    },
    preserve: function (preserveMap) {
      var preserve =
            (this._tmpl_data.preserve = (this._tmpl_data.preserve || {}));

      if (_.isArray(preserveMap))
        _.each(preserveMap, function (selector) {
          preserve[selector] = true;
        });
      else
        _.extend(preserve, preserveMap);
    },
    helpers: function (helperMap) {
      var helpers =
            (this._tmpl_data.helpers = (this._tmpl_data.helpers || {}));
      for(var h in helperMap)
        helpers[h] = helperMap[h];
    }
  };

  Meteor._def_template = function (name, raw_func) {
    Meteor._hook_handlebars();

    window.Template = window.Template || {};


    // Define the function assigned to Template.<name>.

    var partial = function (data) {
      data = data || {};
      var tmpl = name && Template[name] || {};
      var tmplData = tmpl._tmpl_data || {};

      var html = Spark.labelBranch("Template."+name, function () {
        var html = Spark.createLandmark({
          preserve: tmplData.preserve || {},
          created: function () {
            var template = templateObjFromLandmark(this);
            template.data = data;
            tmpl.created && tmpl.created.call(template, tmpl);

            if (data.id) {
                Meteor.templatesById[data.id] = template;
                _.each(Meteor.templatesByIdCallbacks[data.id], function (cb) {
                  cb(template);
                });
            }

          },
          rendered: function () {
            var template = templateObjFromLandmark(this);
            template.data = data;

            var path = template._id();
            if (template.firstRender && path in templateStoresByPath) {
              //restore store
              var store = templateStoresByPath[path]
              delete templateStoresByPath[path];
              if(store) template.store.setMany(store);
            }

            tmpl.rendered && tmpl.rendered.call(template);
            template.emitRender();

            
            template.firstRender = false;
          },
          destroyed: function () {
            var template = templateObjFromLandmark(this)
            tmpl.destroyed &&
              tmpl.destroyed.call(template);
            template.emitDestroy();
            delete templateInstanceData[this.id];
          },
          enter: function () {
            this.oldTemplate = Meteor.template;
            Meteor.template = templateObjFromLandmark(this);
          },
          exit: function() {
            Meteor.template = this.oldTemplate;
          }
        }, function (landmark) {

          var html = Spark.isolate(function () {
            // XXX Forms needs to run a hook before and after raw_func
            // (and receive 'landmark')
            return raw_func(data, {
              helpers: _.extend({}, partial, tmplData.helpers || {}),
              partials: Meteor._partials,
              name: name
            });
          });


          // take an event map with `function (event, template)` handlers
          // and produce one with `function (event, landmark)` handlers
          // for Spark, by inserting logic to create the template object.
          var wrapEventMap = function (oldEventMap) {
            var newEventMap = {};
            _.each(oldEventMap, function (handler, key) {
              newEventMap[key] = function (event, landmark) {
                return handler.call(this, event,
                                    templateObjFromLandmark(landmark));
              };
            });
            return newEventMap;
          };

          // support old Template.foo.events = {...} format
          var events =
                (tmpl.events !== Meteor._template_decl_methods.events ?
                 tmpl.events : tmplData.events);
          // events need to be inside the landmark, not outside, so
          // that when an event fires, you can retrieve the enclosing
          // landmark to get the template data
          if (tmpl.events)
            html = Spark.attachEvents(wrapEventMap(events), html);
          return html;
        }, name);
        html = Spark.setDataContext(data, html);
        return html;
      });

      return html;
    };

    // XXX hack.. copy all of Handlebars' built in helpers over to
    // the partial. it would be better to hook helperMissing (or
    // something like that?) so that Template.foo is searched only
    // if it's not a built-in helper.
    _.extend(partial, Handlebars.helpers);


    if (name) {
      if (Template[name])
        throw new Error("There are multiple templates named '" + name +
                        "'. Each template needs a unique name.");

      Template[name] = partial;
      _.extend(partial, Meteor._template_decl_methods);
      partial._tmpl_data = {};

      Meteor._partials[name] = partial;
    }

    // useful for unnamed templates, like body
    return partial;
  };

})();
