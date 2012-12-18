(function() {

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


angular.module("meteor")
	.run(["$templateCache", function($templateCache) {
		_.each(AngularTemplates, function(tmpl, url) {
			$templateCache.put(url, tmpl);
		});
	}]);


meteorModule.run(['$rootScope', function($rootScope) {
	$rootScope.$safeApply = function(expr) {
		var phase = this.$root.$$phase;
		if (phase === '$apply' || phase === '$digest') 
			this.$eval(expr);
		else
			this.$apply(expr);
	}
}]);
/*
*/

angular.element(document).ready(function() {
	angular.bootstrap(document, ["app"]);

});

})();

