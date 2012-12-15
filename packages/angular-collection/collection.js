var meteorModule = angular.module('meteor');

meteorModule.factory('$collection', ['$rootScope', function(rootScope) {

	var collections = {};

	function collection(name) {
		var mc = new Meteor.Collection(name);
		var ac = Object.create(mc);
		ac.find = function() {
			var results = [];

			mc.find.apply(ac, _.toArray(arguments)).observe({
				added: function(document, beforeIndex) {
	        rootScope.$safeApply(function() {
	          results.splice(beforeIndex, 0, document);
	        });
	      },
	      changed: function(newDocument, atIndex, oldDocument) {
	      	rootScope.$safeApply(function() {
	      		results[atIndex] = newDocument;
	      	});
	      },
	      moved: function(document, oldIndex, newIndex) {
	      	rootScope.$safeApply(function() {
	      		results.splice(oldIndex, 1);
	      		results.splice(newIndex, 0, document);
	      	});
	      },
	      removed: function(oldDocument, atIndex) {
	      	rootScope.$safeApply(function() {
	      		results.splice(atIndex, 1);
	      	});
	        
	      }
			});

			return results;
		}

		ac.findOne = function() {
			var result = {};

			//XXX could use some optimization
			function clearExtend(doc) {
				_.keys(result, function(key) {
					delete result[key];
				});

				_.extend(result, doc);
			}

			mc.find.apply(ac, _.toArray(arguments)).observe({
				added: function(document, beforeIndex) {
					if (beforeIndex === 0) {
						rootScope.$safeApply(function() {
		          clearExtend(document);
		        });
					}
	        
	      },
	      changed: function(newDocument, atIndex, oldDocument) {
	      	if (atIndex === 0) {
	      		rootScope.$safeApply(function() {
		      		clearExtend(newDocument);
		      	});
	      	}
	      	
	      },
	      moved: function(document, oldIndex, newIndex) {
	      	if (newIndex === 0) {
	      		rootScope.$safeApply(function() {
		          clearExtend(document);
		        });
	      	}
	      	
	      },
	      removed: function(oldDocument, atIndex) {
	      	if (atIndex === 0) {
	      		rootScope.$safeApply(function() {
		      		_.keys(result, function(key) {
								delete result[key];
							});
		      	});
	      	}
	      }
			});

			return result;
		}

		return ac;

	}

	return function(name) {
		if (! (name in collections))
			collections[name] = collection(name);
		return collections[name];
	}

}]);