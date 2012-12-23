window.AngularTemplates = {};

Meteor._def_angular_template = function(name, template) {
	AngularTemplates[name] = template;
}

var meteorModule = angular.module("meteor", [], ['$provide', function($provide) {
	$provide.provider('$templates', function() {
		var self = this;
		self.map = function(path) {
			return AngularTemplates[path];
		}
		self.$get = function() {
			return self.map;
		};
	});
}]);


meteorModule.run(['$rootScope', '$q', '$templateCache', '$meteor' , '$collection',
	function($rootScope, $q, $templateCache, $meteor, $collection) {
	$rootScope.$safeApply = function(expr) {
		var phase = this.$root.$$phase;
		if (phase === '$apply' || phase === '$digest') 
			this.$eval(expr);
		else
			this.$apply(expr);
	}

	function digestNow() {
		var phase = $rootScope.$$phase;
		if(phase !== '$apply' && phase !== '$digest')
			$rootScope.$digest();
	}
	var digestAfter = _.bind(setTimeout, window, digestNow, 50);
	var throttledDigest = _.throttle(digestAfter, 50);
	$rootScope.$throttledSafeApply = function(expr) {
		this.$eval(expr);
		throttledDigest();
	}

	$rootScope.$promisedCall = function() {
		var self = this;
		var args = _.toArray(arguments);
		var fn = args.shift();
		var defer = $q.defer();

		args.push(function() {
			var cbArgs = _.toArray(arguments);
			var err = cbArgs.shift();
			self.$throttledSafeApply(function() {
				if (!err) defer.resolve.apply(defer, cbArgs);
				else defer.reject(err);
			});
		});

		fn.apply(null, args);
		return defer.promise;
	}

	$rootScope.$subscribe = $meteor.subscribe;

	$rootScope.$collection = function(name) {
		return $collection(name, this);
	}

	_.each(AngularTemplates, function(tmpl, url) {
		$templateCache.put(url, tmpl);
	});

}]);

meteorModule.factory('$collection', function() {

	var collections = {};

	function collection(name, scope) {
		if (! (name in collections)) {
			if(name === 'users')
				collections[name] = Meteor.users;
			else
				collections[name] = new Meteor.Collection(name);
		}

		var mc = collections[name];

		if (!scope)
			return mc;

		var ac = Object.create(mc);
		ac.find = function(selector, options) {
			var results = [];

			if(_.isFunction(selector)) {
				var fn = selector;
				scope.$watch(fn, function(selector) {
					results.$cursor && results.$cursor.replaceSelector(selector);
				}, true);
				selector = fn();
			}

			var cursor = mc.find.call(ac, selector, options);
			var handle = cursor.observe({
				added: function(document, beforeIndex) {
	        scope.$throttledSafeApply(function() {
	          results.splice(beforeIndex, 0, document);
	        });
	      },
	      changed: function(newDocument, atIndex, oldDocument) {
	      	scope.$throttledSafeApply(function() {
	      		results[atIndex] = newDocument;
	      	});
	      },
	      moved: function(document, oldIndex, newIndex) {
	      	scope.$throttledSafeApply(function() {
	      		results.splice(oldIndex, 1);
	      		results.splice(newIndex, 0, document);
	      	});
	      },
	      removed: function(oldDocument, atIndex) {
	      	scope.$throttledSafeApply(function() {
	      		results.splice(atIndex, 1);
	      	});
	        
	      }
			});

			scope.$on('destroy', function() {
				handle.stop();
			});

			results.__proto__ = Object.create(results.__proto__);
			results.__proto__.$cursor = cursor;
			return results;
		}

		ac.findOne = function(selector, options) {
			var result = {};

			if(_.isFunction(selector)) {
				var fn = selector;
				scope.$watch(fn, function(selector) {
					results.$cursor && results.$cursor.replaceSelector(selector);
				}, true);
				selector = fn();
			}

			//XXX could use some optimization
			function clearExtend(doc) {
				_.keys(result, function(key) {
					delete result[key];
				});

				_.extend(result, doc);
			}

			var cursor = mc.find.apply(ac, _.toArray(arguments));
			var handle = cursor.observe({
				added: function(document, beforeIndex) {
					if (beforeIndex === 0) {
						scope.$throttledSafeApply(function() {
		          clearExtend(document);
		        });
					}
	        
	      },
	      changed: function(newDocument, atIndex, oldDocument) {
	      	if (atIndex === 0) {
	      		scope.$throttledSafeApply(function() {
		      		clearExtend(newDocument);
		      	});
	      	}
	      	
	      },
	      moved: function(doc, oldIndex, newIndex) {
	      	if (oldIndex === 0) {
	      		scope.$throttledSafeApply(function() {
	      			clearExtend(cursor.fetch()[0]);
	      		})
	      	}
	      },
	      removed: function(oldDocument, atIndex) {
	      	if (atIndex === 0) {
	      		scope.$throttledSafeApply(function() {
		      		clearExtend(cursor.fetch()[0]);
		      	});
	      	}
	      }
			});

			scope.$on('destroy', function() {
				handle.stop();
			});

			result.__proto__ = {$cursor: cursor};
			return result;
		}

		return ac;

	}

	return function(name, scope) {
		return collection(name, scope);
	}

});


meteorModule.factory('$meteor', ['$rootScope', '$collection', function($rootScope, $collection) {
 	
	function subscribe() {
		var args = _.toArray(arguments);
		var handle = {loading: true};
		if (_.isFunction(args[args.length - 1])) {
			var fn = args.pop();
		} else {
			fn = _.identity;
		}

		args.push(function() {
			$rootScope.$throttledSafeApply(function() {
				handle.loading = false;
				fn();
			});
				
		});
		var _handle = Meteor.subscribe.apply(Meteor, args);
		handle.stop = _handle.stop;
		this.$on && this.$on('destroy', function() {
			handle.stop();
		});
		return handle;
	}

	
	
	function user() {
		var fields = _.toArray(arguments);
		if (! fields.length)
			fields = undefined;
		var user = null;
		var userId = Meteor.default_connection.userIdAsync(function(userId) {
			user.$cursor.replaceSelector({username: userId});
		});

		user = $collection('users', $rootScope).findOne({username: userId}, {fields: fields});
		return user;
	}

	return {
		subscribe: subscribe,
		methods: _.bind(Meteor.methods, Meteor),
		call: _.bind(Meteor.call, Meteor),
		apply: _.bind(Meteor.apply, Meteor),
		status: _.bind(Meteor.default_connection.status, Meteor.default_connection),
		reconnect: _.bind(Meteor.reconnect, Meteor),
		connect: _.bind(Meteor.connect, Meteor),
		loggingIn: _.bind(Meteor.loggingInAsync, Meteor),
		user: user,
		userId: _.bind(Meteor.default_connection.userIdAsync, Meteor.default_connection)
	}

}]);




