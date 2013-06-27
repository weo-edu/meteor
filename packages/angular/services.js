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

	function hashKeyWrap(o) {
		var hashWrap = {$$hashKey: hashFn};
		if(! o.$$hashKey) {
			hashWrap.__proto__ = o.__proto__;
			o.__proto__ = hashWrap;
		}
		return o;
	}

	var hasFields = function(doc) {
		return _.keys(doc).length > 1;
	}

	meteorModule.factory('$collection', function meteorCollectionService() {
		var collections = {users: Meteor.users};
		function maker(name, scope, local) {
			var Collection = local ? LocalCollection : Meteor.Collection;
			if(Meteor.isClient) {
				collections[name] = collections[name]
					|| Meteor.default_connection._stores[name]
					|| new Collection(name);
			} else {
				collections[name] = collections[name] || new Collection(name);
			}

			var cleanup = u.cleanupQueue();
			var collection = collections[name];

			if (! scope || Meteor.isServer)
				return collection;


			function normalizeSelector(sel) {
				if(u.hasFunctions(sel)) {
					return function() {
						return u.evalObj(_.clone(sel, true));
					};
				}
				return sel;
			}

			function watchSelector(sel, cursor, onChange) {
				if(_.isFunction(sel)) {
					//	JSON stringify/parse are used to skirt around the fact
					//	that angular's deep equality checker skips keys with $'s
					//	on them, which minimongo also uses.  XXX Slow?
					var fn = _.compose(JSON.stringify, sel);
					var handle = scope.$watch(fn, function(s) {
						if(s && cursor) {
							onChange && onChange();
							cursor.replaceSelector(JSON.parse(s));
						}
					}, true);
					return cleanup.add(handle);
				}

				return _.identity;
			}

			function setupResultProto(resultProto, cursor, stop) {
				resultProto.$cursor = cursor;
				resultProto.$stop = cleanup.add(function() {
					stop();
					resultProto.$cursor = null;
					resultProto.$stop = null;
					resultProto.$subscribe = null;
				});

				resultProto.$subscribe = function() {
					var subscription = scope.$subscribe.apply(scope, _.toArray(arguments));
					resultProto.$onReady = subscription.onReady;
					resultProto.$stop = cleanup.add(_.wrap(resultProto.$stop, function(fn) {
						fn();
						subscription.stop();
						resultProto.$onReady = null;
					}));
					return this;
				}
			}


			var scopedCollection = Object.create(collection);

			scopedCollection.cursor = function(selector, options, onChange) {
				selector = normalizeSelector(selector);
				var cursor = collection.find(_.isFunction(selector)
					? selector()
					: selector, options
				);

				cursor.stop = cleanup.add(
					watchSelector(selector, cursor, onChange));

				var observeChanges = cursor.observeChanges;
				cursor.observeChanges = function(callbacks) {
					var handle = observeChanges.call(cursor, callbacks);
					handle.stop = cleanup.add(_.wrap(handle.stop, function stopObserveChanges(fn) {
						cursor.stop();
						fn.apply(handle);
					}));
					return handle;
				};

				cursor.__proto__ = Object.create(cursor.__proto__);
				return cursor;
			};

			scopedCollection.find = function(selector, options) {
				var self = this;
				var results = [];
				var callbacks = {
					addedAt: function(document, atIndex) {
		        scope.$throttledSafeApply(function() {
		          results.splice(atIndex, 0, hashKeyWrap(document));
		        });
		      },
		      changedAt: function(newDocument, oldDocument, atIndex) {
		      	scope.$throttledSafeApply(function() {
		      		results[atIndex] = hashKeyWrap(newDocument);
		      	});
		      },
		      movedTo: function(document, oldIndex, newIndex) {
		      	scope.$throttledSafeApply(function() {
		      		results.splice(oldIndex, 1);
		      		results.splice(newIndex, 0, hashKeyWrap(document));
		      	});
		      },
		      removedAt: function(oldDocument, atIndex) {
		      	scope.$throttledSafeApply(function() {
		      		results.splice(atIndex, 1);
		      	});
		      }
				};

				options = options || {};
				if(options.batch) {
					var batch = options.batch;
					callbacks = u.batched(callbacks, batch.changes,
						batch.per, batch.after, null, 'addedAt');
				}

				var cursor = this.cursor(selector, options, callbacks.flush);
				var handle = cursor.observe(callbacks);

				var stopFind = cleanup.add(function() {
					handle.stop();
					cursor.stop();
					if(options && options.batch)
						callbacks.stop();
				});
				results.__proto__ = Object.create(results.__proto__);
				setupResultProto(results.__proto__, cursor, stopFind);
				return results;
			}



			scopedCollection.findOne = function(selector, options , result) {
				var self = this;
				result = result || {};

				function clearExtend(fields) {
					/*if (! fields) {
						for(var key in result) {
							if(result.hasOwnProperty(key))
								delete result[key];
						}
					} else {
						_.each(fields, function(val, key) {
							result[key] = val;
						});
						_.each(result, function(val, key) {
							if(! fields.hasOwnProperty(key))
								delete result[key];
						});
					}*/
					_.each(result, function(val, key) {
						delete result[key];
					});
					_.each(fields, function(val, key) {
						result[key] = val;
					});
				}

				options = options || {};
				options.limit = 1;

				var proto = {};
				var cursor = this.cursor(selector, options);
				var handle = cursor.observe({
					addedAt: function(doc) {
						// Don't assign to result.__proto__
						// use the saved proto variable, otherwise
						// we risk creating an infinitely long
						// prototype chain as objects are added
						// and removed.
						doc.__proto__ = proto;
						result.__proto__ = doc.__proto__;
						scope.$throttledSafeApply(function() {
		          clearExtend(doc);
		        });
		      },
		      changedAt: function(doc) {
	      		scope.$throttledSafeApply(function() {
		      		clearExtend(doc);
		      	});
		      },
		      removedAt: function(doc) {
	      		scope.$throttledSafeApply(function() {
		      		clearExtend();
		      	});
		      }
				});

				var stopFindOne = cleanup.add(function() {
					handle.stop();
					cursor.stop();
					scope = null;
				});

				result.__proto__ = proto;
				setupResultProto(proto, cursor, stopFindOne);
				return result;
			}


			/*
				Move these callbacks outside of the .leftJoin function
				to avoid putting them inside that closure
			*/
			function leftJoinLeftCallbacks(results, docs, collection2, on) {
				return {
					addedAt: function(document, atIndex) {
		        scope.$throttledSafeApply(function() {
		        	var doc = {};
		        	doc[name] = document;

		        	var joinVal = u.get(document, on[0]);
		        	doc._id = joinVal
		        	hashKeyWrap(doc);
		        	docs[joinVal] = doc;

		        	var selector = {};
		        	selector[on[1]] = joinVal;
		        	doc[collection2] = collections[collection2].findOne(selector);
		          results.splice(atIndex, 0, doc);
		        });
		      },
		      changedAt: function(newDocument, oldDocument, atIndex) {
		      	scope.$throttledSafeApply(function() {
		      		results[atIndex][name] = newDocument;
		      	});
		      },
		      movedTo: function(document, oldIndex, newIndex) {
		      	scope.$throttledSafeApply(function() {
		      		var doc = docs[u.get(document, on[0])];
		      		results.splice(oldIndex, 1);
		      		results.splice(newIndex, 0, doc);
		      	});
		      },
		      removedAt: function(oldDocument, atIndex) {
		      	scope.$throttledSafeApply(function() {
		      		results.splice(atIndex, 1);
		      		delete docs[u.get(document, on[0])];
		      	});
		      }
				};
			}

			function leftJoinRightCallbacks(results, docs, collection2, on) {
				return {
					added: function(document) {
						scope.$throttledSafeApply(function() {
							var joinVal = u.get(document, on[1]);
							if (docs[joinVal])
								docs[joinVal][collection2] = document;
						});
					},
					changed: function(newDocument) {
						scope.$throttledSafeApply(function() {
							var joinVal = u.get(newDocument, on[1]);
							if (docs[joinVal])
								docs[joinVal][collection2] = newDocument;
						});
					},
					removed: function(oldDocument) {
						scope.$throttledSafeApply(function() {
							var joinVal = u.get(oldDocument, on[1]);
							if (docs[joinVal])
								delete docs[joinVal][collection2];
						});
					}
				};
			}

			scopedCollection.leftJoin = function(selector, options, on, collection2,  selector2) {
				var results = [];
				var docs = {};
				var cursor = collection.find(selector, options);
				var handle = cursor.observe(leftJoinLeftCallbacks(results, docs, collection2, on));
				var handle2 = collections[collection2].find(selector2 || {})
					.observe(leftJoinRightCallbacks(results, docs, collection2, on));

				var stop = cleanup.add(function() {
					handle.stop();
					handle2.stop();
					results.__proto__ = {};
				});

				results.__proto__ = Object.create(results.__proto__);
				setupResultProto(results.__proto__, cursor, stop);
				return results;
			}

			scopedCollection.stop = function stopCollection() {
				cleanup.run();
			};

			cleanup.add(
				scope.$on('$destroy', _.bind(scopedCollection.stop, scopedCollection)));

			return scopedCollection;
		}

		maker.union = function makerUnion() {
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

			collection.stop = function joinCollStop() {
				_.invoke(handles, 'stop');
				delete collections[id];
			}
			return collection;
		}

		maker.join = function makerJoin(options, scope) {
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

			var cleanup = u.cleanupQueue();
			function setupCursors(cursors) {
				_.each(cursors, function(cursor) {
					var cursorCollection = maker.union(cursor);
					cleanup.add(_.bind(cursorCollection.stop, cursorCollection));
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
					cleanup.add(_.bind(handle.stop, handle));
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
			joinCollection.stop = function joinCollectionStop() {
				cleanup.run();
			}

			scope && scope.$on('$destroy', function() {
				cleanup.run();
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
				return this.$eval(expr);
			else
				return this.$apply(expr);
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

			var destroyed = false;
			self.$on('$destroy', function() {
				destroyed = true;
			});

			args.push(function() {
				if (destroyed)
					return;
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
					fn && fn(val);
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
		$rootScope.__proto__.$autosubscribe = function(name, fn, objectEquality) {
			var self = this,
				last = null,
				next = null;
			return self.$watch(fn, function(args) {
				if(args !== undefined) {
  				next = self.$subscribe.apply(self, [name].concat(args));
  				last && last.stop();
  				last = next;
  				//last = null;
				}
			}, objectEquality);
		};

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
			var handle;
			var fn = _.isFunction(_.last(args)) ? args.pop() : _.identity;

			args.push(function() {
				handle && handle.emit('ready');
				fn();
			});

			handle = Meteor.subscribe.apply(Meteor, args);
			handle.__proto__ = Emitter.prototype;
			Emitter.call(handle);

			var oldStop = _.bind(handle.stop, handle);
			handle.onReady = _.bind(handle.on, handle, 'ready');
			handle.stop = function() {
				handle.stopped = true;
				off && off();
				oldStop();
				handle.onReady = null;
				handle = null;
				oldStop = null;
			};
			var off = this.$on && this.$on('$destroy', handle.stop);
			return handle;
		}

		function user(scope) {
			var fields = _.toArray(arguments);
			var scope = null;
			if(fields.length && ! _.isString(fields[0]))
				scope = fields.shift();

			if (! fields.length)
				fields = undefined;

			var def = {username: Meteor.userId(), loading: true};

			//XXX add fields support
			return $collection('users', scope).findOne(
				{username: Meteor.userId()}, {fields: fields},
				def) || def;
			//return user;
		}

		var ret = {
			subscribe: subscribe,
			call: Meteor.call && _.bind(Meteor.call, Meteor),
			apply: Meteor.apply && _.bind(Meteor.apply, Meteor),
			user: user,
			isClient: Meteor.isClient,
			isServer: Meteor.isServer,
			setTimeout: Meteor.setTimeout && _.bind(Meteor.setTimeout, Meteor),
			setInterval: Meteor.setInterval && _.bind(Meteor.setInterval, Meteor),
			clearTimeout: Meteor.clearTimeout && _.bind(Meteor.clearTimeout, Meteor),
			clearInterval: Meteor.clearInterval && _.bind(Meteor.clearInterval, Meteor),
			Collection: Meteor.Collection && _.bind(Meteor.Collection, Meteor),
			defer: Meteor.defer && _.bind(Meteor.defer, Meteor),
			methods: function(module, methods) {
				var namespaced = {};
				if(arguments.length === 1)
					namespaced = module;
				else {
					_.each(methods, function(val, key) {
						var path = module+'.'+key;
						// XXX Hack to work around angular re-running
						// our .run blocks in tests
						if(Meteor.isClient) {
							// Ugh, meteor uses different naming conventions for
							// the server and client.
							if(Meteor.default_connection._methodHandlers
								&& Meteor.default_connection._methodHandlers[path])
								delete Meteor.default_connection._methodHandlers[path];
						} else {
							if(Meteor.default_server.method_handlers
								&& Meteor.default_server.method_handlers[path])
								delete Meteor.default_server.method_handlers[path];
						}

						namespaced[path] = val;
					});
				}

				Meteor.methods(namespaced);
			},
			mode: function() {
				return __meteor_runtime_config__.METEOR_DEV_MODE
					? 'development'
					: 'production';
			}
		};
		if(Meteor.isClient && Meteor.default_connection) {
			console.log('Meteor', Meteor.logout, Meteor);
			ret.logout = _.bind(Meteor.logout, Meteor);
			ret.loginWithPassword = _.bind(Meteor.loginWithPassword, Meteor);
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
