;(function(global) {
	global.AngularTemplates = {};

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


	function hashFn() {
		return this._id;
	}
	var hashWrap = {$$hashKey: hashFn};
	function hashKeyWrap(o) {
		if(! o.$$hashKey)
			o.__proto__ = hashWrap;
		return o;
	}

	meteorModule.factory('$collection', function() {
		var collections = {users: Meteor.users};
		function maker(name, scope, local) {
			var Collection = local ? LocalCollection : Meteor.Collection;
			collections[name] = collections[name] || new Collection(name);

			var cleanup = [];
			var collection = collections[name];
			if (! scope || Meteor.isServer)
				return collection;

			function monitor(sel, results, options, callbacks) {
				if(u.hasFunctions(sel)) {
					var o = sel;
					sel = function() {
						return u.evalObj(_.clone(o, true));
					};
				}

				if(_.isFunction(sel)) {
					//	JSON stringify/parse are used to skirt around the fact
					//	that angular's deep equality checker skips keys with $'s
					//	on them, which minimongo also uses.  XXX Slow?
					var fn = _.compose(JSON.stringify, sel);
					var handle = scope.$watch(fn, function(s) {
						if(s && results.$cursor) {
							callbacks && callbacks.flush && callbacks.flush();
							results.$cursor.replaceSelector(JSON.parse(s));
						}
					}, true);
					sel = sel();
					cleanup.push(handle);
				}
				return sel;
			}

			var scopedCollection = Object.create(collection);
			scopedCollection.find = function(selector, options) {
				var results = [];
				var callbacks = {
					added: function(document, beforeIndex) {
		        scope.$throttledSafeApply(function() {
		          results.splice(beforeIndex, 0, hashKeyWrap(document));
		        });
		      },
		      changed: function(newDocument, atIndex, oldDocument) {
		      	scope.$throttledSafeApply(function() {
		      		results[atIndex] = hashKeyWrap(newDocument);
		      	});
		      },
		      moved: function(document, oldIndex, newIndex) {
		      	scope.$throttledSafeApply(function() {
		      		results.splice(oldIndex, 1);
		      		results.splice(newIndex, 0, hashKeyWrap(document));
		      	});
		      },
		      removed: function(oldDocument, atIndex) {
		      	scope.$throttledSafeApply(function() {
		      		results.splice(atIndex, 1);
		      	});
		      }
				};
				if(options && options.batch)
					callbacks = u.batched(callbacks, options.batch.changes, options.batch.per, null, 'added');

				selector = monitor(selector, results, options, callbacks);

				var cursor = collection.find.call(scopedCollection, selector, options);

				var handle = cursor.observe(callbacks);
				cleanup.push(_.bind(handle.stop, handle));
				scope.$on('$destroy', _.bind(scopedCollection.stop, scopedCollection));
				results.__proto__ = Object.create(results.__proto__);
				results.__proto__.$cursor = cursor;
				return results;
			}

			scopedCollection.findOne = function(selector, options , result) {
				result = result || {};
				selector = monitor(selector, result, options);

				function clearExtend(doc) {
					for(var key in result)
						if(result.hasOwnProperty(key))
							delete result[key];

					for(var key in doc)
						if(doc.hasOwnProperty(key))
							result[key] = doc[key];
				}

				var cursor = collection.find.apply(scopedCollection, _.toArray(arguments));
				var handle = cursor.observe({
					added: function(document, beforeIndex) {
						if (beforeIndex === 0) {
							scope.$throttledSafeApply(function() {
			          clearExtend(hashKeyWrap(document));
			        });
						}
		      },
		      changed: function(newDocument, atIndex, oldDocument) {
		      	if (atIndex === 0) {
		      		scope.$throttledSafeApply(function() {
			      		clearExtend(hashKeyWrap(newDocument));
			      	});
		      	}
		      },
		      moved: function(doc, oldIndex, newIndex) {
		      	if (oldIndex === 0) {
		      		scope.$throttledSafeApply(function() {
		      			clearExtend(hashKeyWrap(cursor.fetch()[0]));
		      		})
		      	}
		      },
		      removed: function(oldDocument, atIndex) {
		      	if (atIndex === 0) {
		      		scope.$throttledSafeApply(function() {
			      		clearExtend({});
			      	});
		      	}
		      }
				});

				cleanup.push(_.bind(handle.stop, handle));
				scope.$on('$destroy', _.bind(scopedCollection.stop, scopedCollection));
				result.__proto__ = {$cursor: cursor};
				return result;
			}

			scopedCollection.stop = function() {
				_.each(cleanup, u.coerce);
				cleanup = [];
				collection.stop && collection.stop();
			}
			return scopedCollection;
		}

		maker.union = function() {
			var id = Meteor.uuid();
			var cursors = _.toArray(arguments);
			var collection = maker(id, null, true);
			var handles = [];
			_.each(cursors, function(cursor) {
				handles.push(cursor.observe({
					added: function(doc) {
						collection.insert(doc);
					},
					changed: function(doc) {
						collection.update(doc._id, {$set: doc});
					},
					removed: function(doc) {
						collection.remove(doc._id);
					}
				}));
			});

			collection.stop = function() {
				_.invoke(handles, 'stop');
				delete collections[id];
			}
			return collection;
		}

		maker.join = function(options, scope) {
			var id = Meteor.uuid();
			var joinCollection = maker(id, null, true);
			var collectionsByName = _.clone(collections);

			var collectionAttrMap = {};
			_.each(options.on, function(name) {
				var collection = name.split('.')[0];
				var attr = name.split('.').slice(1).join('.');
				collectionAttrMap[collection] = attr;
				collectionsByName[collection]._name = collection;
			});

			var otherCollections = {};
			_.each(collectionAttrMap, function(attr, coll) {
				var otherMap = _.clone(collectionAttrMap);
				delete otherMap[coll];
				otherCollections[coll] = otherMap;
			});

			function cartesianProduct(nameResults, objects, depth) {
				depth = depth || 0;
				if (depth > 10)
					throw new Error('too deep');
				var names = _.keys(nameResults);
				if (names.length === 0)
					return objects;
				var name = names[0];
				if (nameResults[name].length == 0)
					return
				else {
					if (!objects) {
						var newObjects = _.map(nameResults[name], function(result) {
							var obj = {};
							obj[name] = result;
							return obj;
						});
					} else {
						var newObjects = [];
						var newObject = null;
						_.each(nameResults[name], function(result) {
							_.each(objects, function(object) {
								newObject = _.clone(object);
								newObject[name] = result;
								newObjects.push(newObject);
							});
						});
					}
					delete nameResults[name];
					return cartesianProduct(nameResults, newObjects, depth + 1);
				}
			}

			function jDoc(doc, collection) {
				if (! (this instanceof jDoc))
					return new jDoc(doc, collection);
				this.doc = doc;
				this.collection = collection;
			}

			jDoc.prototype.joinValue = function() {
				return this.doc[this.joinAttr()];
			}

			jDoc.prototype.joinAttr = function() {
				return collectionAttrMap[this.collection._name]
			}

			jDoc.prototype.otherCollections = function() {
				return otherCollections[this.collection._name];
			}

			jDoc.prototype.query = function() {
				var query = {};
				query[this.collection._name + '._id'] = this.doc._id;
				return query;
			}

			jDoc.prototype.forInsert = function() {
				var self = this;
				var insertable = {};
				insertable[self.collection._name] = self.doc;
				_.each(self.otherCollections(), function(attr, name) {
					var collObj = {};
					collObj[attr] = self.joinValue();
					insertable[name] = collObj;
				});
				return insertable;
			}

			jDoc.prototype.forUpdate = function() {
				var forupdate = {};
				forupdate[this.collection._name] = this.doc;
				return forupdate;
			}

			
			function add(doc, collection) {
				var self = this;
				var jdoc = jDoc(doc, collection);

				if (joinCollection.find(jdoc.query()).count() > 0)
					return;
				
				var resultsByCollectionName = {};
				resultsByCollectionName[collection._name] = [doc];
				_.each(jdoc.otherCollections(), function(attr, name) {
					var coll = collectionsByName[name];
					var query = {};
					var firstJoin
					query[attr] = jdoc.joinValue();
					resultsByCollectionName[name] = coll.find(query).fetch();
				});

				_.each(cartesianProduct(resultsByCollectionName), function(obj) {
					joinCollection.insert(obj);
				});
			}

			function update(doc, collection) {
				doc = jDoc(doc, collection);
				joinCollection.update(doc.query(), {$set: doc.forUpdate()}, {multi: true});
			}

			function remove(doc, collection) {
				doc = jDoc(doc, collection);
				joinCollection.remove(doc.query());
			}
			
			var cleanup = [];
			function setupCursors(cursors) {
				_.each(cursors, function(cursor) {
					var cursorCollection = maker.union(cursor);
					cleanup.push(function() {
						cursorCollection.stop();
					});
					collectionsByName[cursor.collection._name] = cursorCollection;
					cursorCollection._name = cursor.collection._name;
				});

				_.each(cursors, function(cursor) {
					var coll = collectionsByName[cursor.collection._name];
					var handle = coll.find().observe({
						added: function(doc) {
							add(doc, cursor.collection);
						},
						changed: function(doc) {
							update(doc, cursor.collection);
						},
						removed: function(doc) {
							remove(doc, cursor.collection);
						}
					});
					cleanup.push(_.bind(handle.stop, handle));
				});
			}

			if (_.isArray(options.cursor)) {        
				setupCursors(options.cursor);
			} else if (scope && _.isFunction(options.cursor)) {
				var fn = _.compose(JSON.stringify, options.cursor);
				scope.watch(fn, function(cursors) {
					joinCollection.remove({});
					if(! cursors || ! cursors.length)
						return;
					setupCursors(cursors);
				});
			}
			joinCollection.stop = function() {
				_.each(cleanup, u.coerce);
				cleanup = [];
			}

			scope && scope.$on('$destroy', function() {
				_.each(cleanup, u.coerce);
				joinCollection.stop && joinCollection.stop();
			});
			return maker(id, scope, true);
		}

		return maker;
	});


	if(Meteor.isServer) {
		meteorModule.factory('$publish', function() {
			return _.bind(Meteor.publish, Meteor);
		});

		meteorModule.factory('$rootScope', function() {
			return function() {
				return {};
			};
		}).factory('$q', function() {
			return function() {
				return {};
			}
		}).factory('$templateCache', function() {
			return function() {
				return {};
			}
		});
	} else {
		meteorModule.factory('$publish', function() {
			return function() {
				return {};
			}
		});
	}
	meteorModule.run(['$rootScope', '$q', '$templateCache', '$meteor' , '$collection',
		function($rootScope, $q, $templateCache, $meteor, $collection) {
		$rootScope.__proto__.$safeApply = function(expr) {
			var phase = this.$root.$$phase;
			if (phase === '$apply' || phase === '$digest') 
				this.$eval(expr);
			else
				this.$apply(expr);
		}

		$rootScope.__proto__.$safeDigest = function() {
			var phase = this.$root.$$phase;
			if (phase !== '$apply' && phase !== '$digest')
				this.$digest();
		}

		function digestNow() {
			var phase = $rootScope.$$phase;
			if(phase !== '$apply' && phase !== '$digest')
				$rootScope.$digest();
		}
		var digestAfter = _.bind(setTimeout, global, digestNow, 50);
		var throttledDigest = _.throttle(digestAfter, 100);
		$rootScope.__proto__.$throttledSafeApply = function(expr) {
			this.$eval(expr);
			throttledDigest();
		}

		$rootScope.__proto__.$promisedCall = function() {
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

		$rootScope.__proto__.$when = function(expr, fn) {
			var handle = this.$watch(expr, function(val) {
				if(!! val) {
					fn(val);
					handle();
				}
			});
		}

		$rootScope.__proto__.$get = function(name /*, arguments */) {
			var args = _.toArray(arguments).slice(1);
			return this.$watch(function() {
				return _.map(args, u.coerce);
			}, function(args) {
				//	Pass in _.identity as the last argument to ensure that
				//	the user cannot pass a completion callback in.  The worst
				//	situation would be that completion callbacks work some
				//	of the time with this function and inexplicably fail in
				//	random cases, so avoid that entirely.
				args && $meteor.get.apply($meteor, [name].concat(args, _.identity));
			}, true);
		}

		$rootScope.__proto__.$subscribe = $meteor.subscribe;

		$rootScope.__proto__.$collection = function(name) {
			return $collection(name, this);
		}

		_.each(AngularTemplates, function(tmpl, url) {
			$templateCache.put(url, tmpl);
		});
	}]);

	meteorModule.factory('$meteor', ['$rootScope', '$collection', function($rootScope, $collection) {
		function subscribe() {
			var args = _.toArray(arguments);
			var handle = {loading: true};
			var fn = _.isFunction(_.last(args)) ? args.pop() : _.identity;

			args.push(function() {
				$rootScope.$throttledSafeApply(function() {
					handle.loading = false;
					fn();
				});	
			});

			var _handle = Meteor.subscribe.apply(Meteor, args);
			handle.stop = _handle.stop;
			this.$on && this.$on('$destroy', function() {
				handle.stop();
			});
			return handle;
		}
		
		function user(scope) {
			var fields = _.toArray(arguments);
			var scope = null;
			if(fields.length && ! _.isString(fields[0]))
				scope = fields.shift();

			if (! fields.length)
				fields = undefined;
			//var user = null;
			//var userId = Meteor.default_connection.userIdAsync(function(userId) {
			//	user.$cursor.replaceSelector({username: userId});
			//});

			return $collection('users', scope).findOne({username: Meteor.userId()}, {fields: fields})
				|| {username: Meteor.userId(), loading: true};
			//return user;
		}

		var ret = {
			subscribe: subscribe,
			methods: _.bind(Meteor.methods, Meteor),
			call: _.bind(Meteor.call, Meteor),
			apply: _.bind(Meteor.apply, Meteor),
			user: user,
			isClient: Meteor.isClient,
			isServer: Meteor.isServer,
			setTimeout: _.bind(Meteor.setTimeout, Meteor),
			setInterval: _.bind(Meteor.setInterval, Meteor),
			clearTimeout: _.bind(Meteor.clearTimeout, Meteor),
			clearInterval: _.bind(Meteor.clearInterval, Meteor),
			uuid: _.bind(Meteor.uuid, Meteor),
			Collection: _.bind(Meteor.Collection, Meteor),
			defer: _.bind(Meteor.defer, Meteor),
			uuid: _.bind(Meteor.uuid, Meteor),
			mode: function() {
				return __meteor_runtime_config__.METEOR_DEV_MODE 
					? 'development' 
					: 'production';
			}
		};
		if(Meteor.isClient && Meteor.default_connection) {
			ret.status = _.bind(Meteor.default_connection.status, Meteor.default_connection);
			ret.userId = _.bind(Meteor.default_connection.userIdAsync, Meteor.default_connection);
			ret.reconnect = _.bind(Meteor.reconnect, Meteor);
			ret.connect = _.bind(Meteor.connect, Meteor);
			ret.loggingIn = _.bind(Meteor.loggingInAsync, Meteor);
			ret.get =  _.bind(Meteor.get, Meteor);
		}
		return ret;
	}]);
})(typeof window === 'undefined' ? global : window);


